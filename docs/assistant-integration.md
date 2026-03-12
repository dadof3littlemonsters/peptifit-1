# Assistant Integration

PeptiFit exposes an assistant-focused API under `/assistant` for Azmodius/OpenClaw. This layer wraps the existing API into stable assistant-safe operations with explicit auth, normalized responses, ambiguity handling, and write verification.

## Auth

Assistant endpoints are disabled unless `ASSISTANT_API_KEY` is set for the backend process.

Recommended env:

```bash
ASSISTANT_API_KEY=replace-with-a-long-random-secret
ASSISTANT_USER_ID=47e8df14-365f-45bf-908f-bc7f88e06712
```

Headers:

```http
Authorization: Bearer <ASSISTANT_API_KEY>
Content-Type: application/json
X-Assistant-User-Id: <optional if ASSISTANT_USER_ID is configured>
```

Rules:

- Existing JWT auth for the main API is unchanged.
- If `ASSISTANT_USER_ID` is not set and more than one PeptiFit user exists, assistant calls are rejected until a user ID is supplied.
- Assistant writes are not public and always require the assistant API key.

## Response shape

Success:

```json
{
  "success": true,
  "warnings": [],
  "verified": true,
  "ids": {
    "food_log_id": "..."
  },
  "data": {
    "food_log": {
      "id": "...",
      "name": "Nutella"
    }
  }
}
```

Failure:

```json
{
  "success": false,
  "warnings": [],
  "error": {
    "code": "ambiguous_food_match",
    "message": "Multiple food candidates matched the provided name",
    "candidates": [
      {
        "id": "3017620422003",
        "source": "off",
        "name": "Nutella"
      }
    ]
  }
}
```

## Ambiguity and confidence rules

- The assistant layer does not silently guess required write data.
- If multiple foods, supplements, or peptides match, the API returns candidates instead of picking one.
- Supplement responses expose normalized practical-dose and strength data. See `/home/peptifit/peptifit/docs/supplement-schema.md`.
- `POST /assistant/log-food` accepts:
  - explicit macros
  - a resolved product object
  - a barcode
  - parsed nutrition-label data
  - a name that resolves to exactly one candidate
- Nutrition-label parsing returns warnings when extracted data is partial or confidence is limited.
- If label parsing depends on a vision model, the backend must have a compatible AI provider configured. In second-pass verification this was tested with Groq and `meta-llama/llama-4-scout-17b-16e-instruct`.

## Endpoints

### Read

- `GET /assistant/daily-summary?date=YYYY-MM-DD`
- `GET /assistant/supplements`
- `GET /assistant/supplement-groups`
- `GET /assistant/supplement-groups/:groupName`
- `GET /assistant/vitals`
- `GET /assistant/blood-results`
- `GET /assistant/peptides`
- `GET /assistant/food/search?query=...`
- `GET /assistant/food/barcode/:code`

### Write / create / update

- `POST /assistant/food/parse-label`
- `POST /assistant/log-food`
- `POST /assistant/log-supplement`
- `POST /assistant/log-supplement-group`
- `POST /assistant/check-supplement-group`
- `POST /assistant/log-vital`
- `POST /assistant/blood-results`
- `POST /assistant/log-peptide-dose`
- `POST /assistant/supplement-groups`
- `POST /assistant/supplements`
- `PUT /assistant/supplement-groups/:groupName`
- `PUT /assistant/supplements/:id`
- `POST /assistant/peptides`
- `PUT /assistant/peptides/:id`
- `POST /assistant/peptide-configs`
- `PUT /assistant/peptide-configs/:id`

Supplement payloads support:

- `count_per_dose`
- `count_unit`
- `strength_amount`
- `strength_unit`
- `strength_basis`
- `total_dose_amount`
- `total_dose_unit`

The assistant may still send legacy `dose_amount` and `dose_unit`, but normalized supplement writes should prefer the new fields.

Supplement reads now return both legacy flat fields and normalized groups:

- `practical_dose`
- `strength`
- `total_dose`
- `components`

`components` is a read-only array derived from existing supplement note text when the note clearly contains extra composition details, for example `Vitamin C 200 mg per tablet`, `EPA 660 mg`, or `Mixed tocopherols 24 mg`.

## Supplement groups

Named supplement groups are now stored in the backend with persisted memberships:

- `supplement_groups`
- `supplement_group_memberships`

Default groups seeded for the current user:

- `morning`
- `evening`
- `bedtime`

The assistant should use group logging for requests like `log my morning supplements` instead of issuing multiple independent `POST /assistant/log-supplement` calls.

### `GET /assistant/supplement-groups`

Returns all active groups and their active supplement members.

```bash
curl -s http://127.0.0.1:3001/assistant/supplement-groups \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

### `GET /assistant/supplement-groups/:groupName`

```bash
curl -s http://127.0.0.1:3001/assistant/supplement-groups/morning \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

Example response:

```json
{
  "success": true,
  "data": {
    "group_name": "morning",
    "supplements": [
      {
        "id": "supp_ashwagandha_001",
        "name": "Ashwagandha KSM-66"
      }
    ]
  }
}
```

### `POST /assistant/log-supplement-group`

Supports either:

- `group_name`
- `supplement_ids`

If both are supplied, the request is rejected.

Named-group example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-supplement-group \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "morning",
    "taken_at": "2026-03-12T07:42:00Z",
    "notes": "Logged by Azmodius at Craig request; morning supplements."
  }'
```

Explicit IDs example:

```bash
curl -s http://127.0.0.1:3001/assistant/log-supplement-group \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "supplement_ids": ["supp_ashwagandha_001", "supp_tongkat_001"],
    "taken_at": "2026-03-12T07:42:00Z",
    "notes": "Logged by Azmodius at Craig request; selected supplements."
  }'
```

Behavior:

- supplements are resolved before any insert result is reported
- one supplement log row is created per resolved supplement
- each created log is re-read for verification
- the response always includes per-item status
- partial failures are returned explicitly and are not hidden

Partial failure example:

```json
{
  "success": false,
  "verified": false,
  "summary": {
    "requested": 2,
    "resolved": 1,
    "succeeded": 1,
    "failed": 1
  },
  "data": {
    "group_name": null,
    "results": [
      {
        "supplement_id": "supp_ashwagandha_001",
        "supplement_name": "Ashwagandha KSM-66",
        "status": "created",
        "supplement_log_id": "log-123"
      },
      {
        "supplement_id": "bad-id",
        "status": "failed",
        "error": "Supplement not found for user"
      }
    ]
  }
}
```

### `POST /assistant/supplement-groups`

Creates a named group with persisted memberships.

```bash
curl -s http://127.0.0.1:3001/assistant/supplement-groups \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "travel-morning",
    "display_name": "Travel Morning",
    "supplement_ids": ["supp_ashwagandha_001", "supp_tongkat_001"]
  }'
```

### `PUT /assistant/supplement-groups/:groupName`

Renames a group or replaces its member list.

```bash
curl -s -X PUT http://127.0.0.1:3001/assistant/supplement-groups/travel-morning \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "travel-morning-v2",
    "display_name": "Travel Morning v2",
    "supplement_ids": ["supp_ashwagandha_001", "supp_tongkat_001", "supp_d3_dc7b8799b77831f4"]
  }'
```

### `DELETE /assistant/supplement-groups/:groupName`

Deletes the named group and its memberships.

```bash
curl -s -X DELETE http://127.0.0.1:3001/assistant/supplement-groups/travel-morning-v2 \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

### `POST /assistant/check-supplement-group`

Checks whether each supplement in a named group or explicit list has at least one log on the supplied date.

```bash
curl -s http://127.0.0.1:3001/assistant/check-supplement-group \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "morning",
    "date": "2026-03-12"
  }'
```

Example response:

```json
{
  "success": true,
  "data": {
    "group_name": "morning",
    "date": "2026-03-12",
    "summary": {
      "total": 8,
      "logged": 8,
      "missing": 0
    },
    "results": [
      {
        "supplement_id": "supp_ashwagandha_001",
        "supplement_name": "Ashwagandha KSM-66",
        "logged": true,
        "latest_taken_at": "2026-03-12T07:42:00Z",
        "supplement_log_id": "log-123"
      }
    ]
  }
}
```

### Delete / correction

- `DELETE /assistant/meals/:id`
- `DELETE /assistant/food-logs/:id`
- `DELETE /assistant/supplement-logs/:id`
- `DELETE /assistant/supplement-groups/:groupName`
- `DELETE /assistant/supplements/:id`
- `DELETE /assistant/peptide-doses/:id`
- `DELETE /assistant/peptide-configs/:id`
- `DELETE /assistant/blood-results/:id`

Delete behavior:

- meals, food logs, supplement logs, peptide doses, and blood results use hard delete
- supplements and peptide configs use soft delete by setting `is_active = 0`
- delete responses confirm the deleted record and `deletion_mode`

## Food workflows

### `GET /assistant/food/search`

Search order:

1. local library and previously logged foods
2. CoFID
3. remote Open Food Facts fallback

Example:

```bash
curl -s "http://127.0.0.1:3001/assistant/food/search?query=grenade%20oreo%20bar" \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

Example response:

```json
{
  "success": true,
  "warnings": [],
  "data": {
    "query": "grenade oreo bar",
    "candidates": [
      {
        "id": "5056214396874",
        "source": "off",
        "name": "Grenade Oreo Protein Bar",
        "brand": "Grenade",
        "calories_per_100g": 383,
        "protein_per_100g": 31
      }
    ]
  }
}
```

### `GET /assistant/food/barcode/:code`

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/food/barcode/3017620422003 \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

### `POST /assistant/food/parse-label`

Accepted input:

- `image` data URL
- `image_base64`
- `image_path`
- `product_name_hint` optional

Output:

- `name`
- `brand`
- `serving_size_g`
- `calories_per_100g`
- `protein_per_100g`
- `carbs_per_100g`
- `fat_per_100g`
- `fibre_per_100g`
- `calories_per_serving`
- `protein_per_serving`
- `carbs_per_serving`
- `fat_per_serving`
- `fibre_per_serving`
- `confidence` when available
- warnings

Example:

```bash
curl -s http://127.0.0.1:3001/assistant/food/parse-label \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/tmp/test-label.png",
    "product_name_hint": "Protein yogurt"
  }'
```

Warning behavior:

- if only part of the label is readable, the endpoint still returns structured output where possible
- any incomplete extraction is surfaced via `warnings`
- the assistant should use those warnings to ask for clarification instead of guessing

### `POST /assistant/log-food`

Supported paths:

1. explicit macros
2. resolved product object from `/assistant/food/search` or `/assistant/food/barcode/:code`
3. parsed label object from `/assistant/food/parse-label`
4. name-only search when exactly one candidate is found
5. barcode lookup

Examples:

Direct macros:

```bash
curl -s http://127.0.0.1:3001/assistant/log-food \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chicken breast",
    "quantity_g": 250,
    "meal_type": "dinner",
    "calories": 413,
    "protein": 77.5,
    "fat": 9
  }'
```

Resolved product:

```bash
curl -s http://127.0.0.1:3001/assistant/log-food \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity_g": 60,
    "meal_type": "snack",
    "resolved_food": {
      "id": "3017620422003",
      "source": "off",
      "name": "Nutella",
      "brand": "Ferrero",
      "calories_per_100g": 539,
      "protein_per_100g": 6.3,
      "carbs_per_100g": 57.5,
      "fat_per_100g": 30.9
    }
  }'
```

Parsed label:

```bash
curl -s http://127.0.0.1:3001/assistant/log-food \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity_g": 150,
    "meal_type": "breakfast",
    "parsed_label": {
      "name": "Protein yogurt",
      "serving_size_g": 150,
      "calories_per_serving": 180,
      "protein_per_serving": 20,
      "carbs_per_serving": 12,
      "fat_per_serving": 4
    }
  }'
```

If multiple candidates match, the endpoint returns `ambiguous_food_match` with a candidate list instead of logging.

## Supplement schema examples

Create a supplement with practical dose plus strength:

```bash
curl -s http://127.0.0.1:3001/assistant/supplements \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tongkat Ali",
    "brand": "British Supplements",
    "count_per_dose": 2,
    "count_unit": "capsule",
    "strength_amount": 250,
    "strength_unit": "mg",
    "strength_basis": "per capsule",
    "total_dose_amount": 500,
    "total_dose_unit": "mg",
    "frequency": "daily",
    "time_of_day": "morning"
  }'
```

Typical normalized supplement response fragment:

```json
{
  "name": "Tongkat Ali",
  "practical_dose": {
    "count_per_dose": 2,
    "count_unit": "capsule",
    "frequency": "daily",
    "time_of_day": "morning"
  },
  "strength": {
    "amount": 250,
    "unit": "mg",
    "basis": "per capsule"
  },
  "total_dose": {
    "amount": 500,
    "unit": "mg"
  },
  "components": []
}
```

Component-rich read fragment:

```json
{
  "name": "Omega 3 Fish Oil",
  "practical_dose": {
    "count_per_dose": 2,
    "count_unit": "softgel",
    "frequency": "twice_daily",
    "time_of_day": "morning|evening"
  },
  "strength": {
    "amount": 2000,
    "unit": "mg",
    "basis": "per 2 softgels"
  },
  "total_dose": {
    "amount": 4000,
    "unit": "mg"
  },
  "components": [
    {
      "name": "omega-3 total",
      "amount": 1100,
      "unit": "mg",
      "basis": "per 2 softgels",
      "context": "per_serving"
    },
    {
      "name": "EPA",
      "amount": 660,
      "unit": "mg",
      "basis": "per 2 softgels",
      "context": "per_serving"
    }
  ]
}
```

## Delete examples

Delete a mistaken food log:

```bash
curl -s -X DELETE http://127.0.0.1:3001/assistant/food-logs/food-log-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

Delete a mistaken supplement log:

```bash
curl -s -X DELETE http://127.0.0.1:3001/assistant/supplement-logs/supp-log-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

Delete a mistaken peptide dose:

```bash
curl -s -X DELETE http://127.0.0.1:3001/assistant/peptide-doses/dose-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

Soft-delete a supplement:

```bash
curl -s -X DELETE http://127.0.0.1:3001/assistant/supplements/supplement-uuid \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "X-Assistant-User-Id: $ASSISTANT_USER_ID"
```

## Verification

Verification script:

- `/home/peptifit/peptifit/backend/scripts/verify-assistant-integration.js`

Run:

```bash
cd /home/peptifit/peptifit/backend
ASSISTANT_API_KEY=replace-with-key \
ASSISTANT_USER_ID=47e8df14-365f-45bf-908f-bc7f88e06712 \
PEPTIFIT_BASE_URL=http://127.0.0.1:3001 \
node scripts/verify-assistant-integration.js
```

Second-pass verification performed on March 11, 2026 against a temporary backend on port `3103` with:

- assistant food search
- barcode lookup
- direct food log
- food log from resolved product
- nutrition-label parsing
- delete meal
- delete food log
- delete supplement log
- delete peptide dose

Label parsing verification used a Groq vision model:

- `AI_PROVIDER=groq`
- `GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct`

If no compatible vision/OCR backend is configured, `/assistant/food/parse-label` returns an explicit error instead of inventing values.

Supplement-group verification performed on March 12, 2026 against a temporary backend on port `3105` with:

- list supplement groups
- read the morning group
- create a named supplement group
- update the named supplement group
- batch log the morning group
- verify all expected supplements were logged
- confirm `POST /assistant/check-supplement-group`
- confirm partial failure reporting with one real ID plus one bad ID
- delete the named supplement group
- confirm invalid group handling
- confirm the frontend still builds cleanly after logs were created

Verification script:

- `/home/peptifit/peptifit/backend/scripts/verify-supplement-groups.js`
