# Error Log

## Import Errors

### 2026-02-20: Invoice item P-0090 in GST-0023-2025/26 failed
- **Cause**: Sales Rate, taxable_amount, and total were 0/blank in the Excel data
- **Impact**: 1 of 260 line items not imported (259 created successfully)
- **Fix**: Not critical — the source data has a zero-value row. Could add fallback pricing in import script.
- **Lesson**: Always handle zero/blank pricing in import — use product's retail_price as fallback

## PocketBase Migration Lessons

### v0.36 Field Format
- `select` fields: use `values: [...]` as flat property, NOT inside `options: {}`
- `relation` fields: use `collectionId`, `maxSelect`, `cascadeDelete` as flat properties
- `text` field with `required: true`: cannot be empty string — use placeholder "-"
- ExcelJS fails on some xlsx files — use `xlsx` (SheetJS) library instead
