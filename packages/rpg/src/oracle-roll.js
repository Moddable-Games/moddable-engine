export function getOracleEntries(data, categoryId) {
  const tableData = data[categoryId]
  if (!Array.isArray(tableData)) return []
  return tableData.flatMap(table =>
    (table.entries || []).map((e, i) => {
      const entry = typeof e === 'string' ? { result: e } : { ...e }
      if (entry.min == null) { entry.min = i + 1; entry.max = i + 1 }
      if (table.name) entry._tableName = table.name
      if (table.id) entry._tableId = table.id
      return entry
    })
  )
}

export function rollOracle(data, categoryId, rng) {
  const entries = getOracleEntries(data, categoryId)
  if (entries.length === 0) return null

  const maxRoll = Math.max(...entries.map(e => e.max))
  const roll = rng.nextInt(1, maxRoll)

  const result = entries.find(e => roll >= e.min && roll <= e.max)
  return result ? { ...result, roll } : { ...entries[entries.length - 1], roll }
}

export function rollRecipe(recipe, data, rng, regionKey) {
  const results = {}

  for (const tableId of recipe.tables) {
    results[tableId] = rollOracle(data, tableId, rng)
  }

  if (recipe.region_table && regionKey) {
    const regionTableId = recipe.region_variants?.[regionKey] || recipe.region_table
    results[recipe.region_table] = rollOracle(data, regionTableId, rng)
  }

  return {
    recipe: recipe.name,
    description: recipe.description,
    results,
  }
}
