# Assistant Integration

PeptiFit exposes a dedicated assistant-facing API under `/assistant`. This layer is intended for Azmodius/OpenClaw and other local automation that needs stable, assistant-safe operations without direct SQLite access.

## Auth

Assistant endpoints are disabled unless `ASSISTANT_API_KEY` is set for the backend process.

Recommended environment variables:

```bash
ASSISTANT_API_KEY=replace-with-a-long-random-secret
ASSISTANT_USER_ID=<your-peptifit-user-id>
```

Request headers:

```http
Authorization: Bearer <ASSISTANT_API_KEY>
Content-Type: application/json
X-Assistant-User-Id: <optional-if-ASSISTANT_USER_ID-is-configured>
```

Notes:

- Existing JWT auth is unchanged for the main API.
- If `ASSISTANT_USER_ID` is not configured and exactly one PeptiFit user exists, the assistant router auto-resolves that user and returns a warning.
- If multiple users exist and no assistant user is specified, assistant writes are refused.

## Response shape

Successful responses:

```json
{
  "success": true,
  "warnings": [],
  "verified": true,
  "ids": {
    "supplement_id": "..."
  },
  "data": {
    "supplement": {
      "id": "...",
      "name": "Magnesium"
    }
  }
}
```

Validation or ambiguity failures:

```json
{
  "success": false,
  "warnings": [],
  "error": {
    "code": "ambiguous_supplement_match",
    "message": "Multiple active supplements match the provided name",
    "candidates": [
      {
        "id": "...",
        "name": "Magnesium"
      }
    ]
  }
}
```

## Ambiguity rules

- Required write fields are never guessed.
- Exact-name matching is case-insensitive but must still resolve to exactly one row.
- If multiple candidates match, the API returns `success: false` with a candidate list.
- Food logging will only auto-resolve a food when there is a single exact local or CoFID match, or when explicit calories are supplied.
- Peptide dose logging validates that `config_id` belongs to the resolved peptide before writing.
- Successful writes return IDs, normalized stored values, and a verification flag after a read-back query.

## Endpoints

### Read

- `GET /assistant/daily-summary?date=YYYY-MM-DD`
- `GET /assistant/supplements`
- `GET /assistant/vitals`
- `GET /assistant/blood-results`
- `GET /assistant/peptides`

### Write and create/update

- `POST /assistant/log-food`
- `POST /assistant/log-supplement`
- `POST /assistant/log-vital`
- `POST /assistant/blood-results`
- `POST /assistant/log-peptide-dose`
- `POST /assistant/supplements`
- `PUT /assistant/supplements/:id`
- `POST /assistant/peptides`
- `PUT /assistant/peptides/:id`
- `POST /assistant/peptide-configs`
- `PUT /assistant/peptide-configs/:id`

## Endpoint details and examples

### `GET /assistant/daily-summary`

Returns:

- `date`
- `meals`
- `meal_totals`
- `food_logs`
- `active_supplements`
- `latest_vitals`
- `recent_peptide_doses`
- `blood_results_recent`

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/daily-summary?date=2026-03-11 \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

### `POST /assistant/log-food`

Accepted fields:

- `name` required
- `quantity_g` required
- `meal_type` optional, defaults to `snack`
- `brand` optional
- `food_id` optional
- `source` optional, `local` or `cofid`
- `logged_at` optional
- `calories`, `protein`, `carbs`, `fat`, `fibre` optional

Behavior:

- If `calories` is supplied, the assistant layer logs directly.
- If calories are not supplied, the assistant layer tries to resolve an exact local or CoFID match first.
- If that lookup is ambiguous, the write is refused with candidates.

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-food \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "name": "Greek yogurt",
    "brand": "Fage",
    "quantity_g": 170,
    "meal_type": "breakfast",
    "calories": 146,
    "protein": 17,
    "carbs": 6,
    "fat": 5
  }'
```

### `POST /assistant/log-supplement`

Accepted fields:

- `supplement_id` or exact `name`
- `taken_at` optional
- `notes` optional

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-supplement \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "name": "Magnesium Glycinate",
    "notes": "Taken with dinner"
  }'
```

### `POST /assistant/log-vital`

Accepted fields:

- `vital_type`
- `value`
- `unit` optional
- `notes` optional
- `measured_at` optional

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-vital \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "vital_type": "weight",
    "value": "98.7",
    "unit": "kg"
  }'
```

### `POST /assistant/blood-results`

Accepted fields:

- `test_date` required, `YYYY-MM-DD`
- `lab_name` optional
- `markers` optional object
- `notes` optional

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/blood-results \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "test_date": "2026-03-11",
    "lab_name": "Medichecks",
    "markers": {
      "vitamin_d": { "value": 42, "unit": "ng/mL" }
    }
  }'
```

### `POST /assistant/log-peptide-dose`

Accepted fields:

- `config_id` optional
- `peptide_id` or exact `peptide_name` when `config_id` is not enough
- `dose_amount`
- `dose_unit`
- `administration_time`
- `injection_site` optional
- `notes` optional

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-peptide-dose \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "config_id": "config-uuid",
    "dose_amount": 250,
    "dose_unit": "mcg",
    "administration_time": "2026-03-11T08:00:00Z",
    "injection_site": "abdomen"
  }'
```

### `POST /assistant/supplements`

Accepted fields:

- `name` required
- `brand`
- `dosage`
- `dose_amount`
- `dose_unit`
- `servings_per_container`
- `frequency`
- `time_of_day`
- `notes`

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/supplements \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "name": "Magnesium Glycinate",
    "brand": "Now Foods",
    "dose_amount": 200,
    "dose_unit": "mg",
    "frequency": "daily",
    "time_of_day": "evening"
  }'
```

### `PUT /assistant/supplements/:id`

Partial updates are supported. Any omitted field keeps its previous value.

Example:

```bash
curl -s -X PUT http://127.0.0.1:3001/assistant/supplements/supplement-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "notes": "Move to bedtime",
    "time_of_day": "night"
  }'
```

### `POST /assistant/peptides`

Accepted fields:

- `name` required
- `description`
- `dosage_range`
- `frequency`
- `administration_route`
- `storage_requirements`

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/peptides \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CJC-1295",
    "description": "Test entry",
    "dosage_range": "100mcg-300mcg",
    "frequency": "daily",
    "administration_route": "Subcutaneous injection",
    "storage_requirements": "Refrigerate"
  }'
```

### `PUT /assistant/peptides/:id`

Partial updates are supported.

Example:

```bash
curl -s -X PUT http://127.0.0.1:3001/assistant/peptides/peptide-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated assistant-managed entry"
  }'
```

### `POST /assistant/peptide-configs`

Accepted fields:

- `peptide_id` required
- `frequency` required
- `doses` optional array
- `cycle_config` optional object
- `custom_days` optional array
- `every_x_days` optional integer
- `notes` optional

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/peptide-configs \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "peptide_id": "peptide-uuid",
    "frequency": "daily",
    "doses": [
      { "amount": 200, "unit": "mcg", "time": "08:00" }
    ],
    "notes": "Morning protocol"
  }'
```

### `PUT /assistant/peptide-configs/:id`

Partial updates are supported.

Example:

```bash
curl -s -X PUT http://127.0.0.1:3001/assistant/peptide-configs/config-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -d '{
    "doses": [
      { "amount": 250, "unit": "mcg", "time": "09:00" }
    ],
    "notes": "Adjusted dose"
  }'
```

## Verification

A practical verification script was added at:

- `/home/peptifit/peptifit/backend/scripts/verify-assistant-integration.js`

Run it with:

```bash
cd /home/peptifit/peptifit/backend
ASSISTANT_API_KEY=replace-with-key \
ASSISTANT_USER_ID=<user-id> \
PEPTIFIT_BASE_URL=http://127.0.0.1:3001 \
node scripts/verify-assistant-integration.js
```

The script exercises:

- daily summary read
- food log
- supplement create and update
- supplement log
- vital log
- blood result create
- peptide create and update
- peptide config create and update
- peptide dose log

The verification data uses an `assistant-test-<timestamp>` prefix. The script archives the temporary supplement and peptide config after the run; peptide, blood result, food log, vital, and dose history remain as explicit test records.
