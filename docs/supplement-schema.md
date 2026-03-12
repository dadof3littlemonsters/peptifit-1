# Supplement Schema

PeptiFit supplements now separate practical dosing from product strength.

## Why

The old fields mixed two different concerns:

- practical logging: `1 tablet`, `2 capsules`, `before bed`
- strength/spec: `4000 IU per tablet`, `250 mg per capsule`, `500 mg total`

The normalized model keeps both.

## Schema

Practical dose fields:

- `count_per_dose`
- `count_unit`
- `frequency`
- `time_of_day`

Strength fields:

- `strength_amount`
- `strength_unit`
- `strength_basis`

Optional total-dose fields:

- `total_dose_amount`
- `total_dose_unit`

Existing product context is still kept:

- `name`
- `brand`
- `servings_per_container`
- `notes`
- `is_active`

Legacy fields are still stored for compatibility:

- `dosage`
- `dose_amount`
- `dose_unit`

They are now derived from the normalized fields on create/update.

## API shape

Supplement reads now expose both flat fields and normalized groups:

```json
{
  "name": "Vitamin D3",
  "brand": "Swiss BioEnergetics",
  "practical_dose": {
    "count_per_dose": 1,
    "count_unit": "tablet",
    "frequency": "daily",
    "time_of_day": "morning"
  },
  "strength": {
    "amount": 4000,
    "unit": "IU",
    "basis": "per tablet"
  },
  "total_dose": {
    "amount": 4000,
    "unit": "IU"
  }
}
```

Tongkat Ali example:

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
  }
}
```

## Migration and backfill

The backend migration adds the new columns to `supplements` and backfills what can be inferred from:

- existing `dose_amount` and `dose_unit`
- existing `dosage`
- supplement name text
- note text such as `250mg each` or `500mg total`

Rules:

- if the existing record clearly stores a practical unit like `tablet`, `capsule`, or `softgel`, it becomes `count_per_dose` + `count_unit`
- if the existing record clearly stores a substance unit like `mg`, `mcg`, `g`, `IU`, or `ml`, it becomes strength or total-dose data
- if the migration cannot infer a field safely, the new field stays `null`
- old notes and legacy fields are preserved

This is meant to make the active stack usable immediately without inventing missing data.

## Current stack migration notes

Handled sensibly by the backfill:

- Vitamin D3
- Vitamin E
- Tongkat Ali
- Niacin
- Magnesium
- Tadalafil
- Boron
- Ashwagandha
- P-5-P

Likely needs manual review because the old row looks ambiguous or product-style rather than dosing-style:

- Omega 3 Fish Oil
- Citrus Bergamot 1200mg
- Iron Bisglycinate with Vitamin C

Those records were preserved. The new fields can be edited in the supplements UI without data loss.

## UI behavior

The supplements UI now shows:

- practical dose for checklist and dossett use
- strength/composition separately
- total dose separately when relevant

Examples:

- `Vitamin D3 - 1 tablet - morning`
- `Vitamin D3 - 4000 IU per tablet`
- `Tongkat Ali - 2 capsules - morning`
- `Tongkat Ali - 250 mg per capsule`
- `Tongkat Ali - Total dose: 500 mg`

## Assistant behavior

Assistant supplement endpoints now accept and return the normalized fields:

- `GET /assistant/supplements`
- `POST /assistant/supplements`
- `PUT /assistant/supplements/:id`
- `POST /assistant/log-supplement`

The assistant can now answer both:

- what do I take?
- what strength is it?

without relying on notes parsing.
