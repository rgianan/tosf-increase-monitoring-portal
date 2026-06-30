export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => String(value).trim() !== '')) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell)
  if (row.some((value) => String(value).trim() !== '')) rows.push(row)
  if (!rows.length) return []

  const headers = rows[0].map((header) => String(header || '').replace(/^\uFEFF/, '').trim())
  return rows.slice(1).map((values) => {
    const item = {}
    headers.forEach((header, index) => {
      item[header] = String(values[index] ?? '').trim()
    })
    return item
  })
}
