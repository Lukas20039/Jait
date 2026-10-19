// An omitted/ignored test must not silently lower migration acceptance.
export function completeCases(required, observed) {
  if (!required.length || new Set(required).size !== required.length) throw new Error('Invalid required-case inventory')
  const indexed = new Map()
  for (const result of observed) {
    if (!required.includes(result.id) || indexed.has(result.id)) throw new Error(`Unexpected or duplicate case: ${result.id}`)
    indexed.set(result.id, result)
  }
  return required.map(id => indexed.get(id) ?? { id, status: 'blocked', reason: 'Required scenario was not executed' })
}
