export type WordBuilderTrayTile = { key: string; glyph: string; placed: boolean }

export type WordBuilderPlacement = {
  slots: (string | null)[]
  tray: WordBuilderTrayTile[]
}

export function toggleWordBuilderTrayTile(placement: WordBuilderPlacement, key: string): WordBuilderPlacement {
  const tile = placement.tray.find((item) => item.key === key)
  if (!tile) return placement
  if (tile.placed) return removeWordBuilderTile(placement, key)

  const emptyIndex = placement.slots.findIndex((slot) => slot === null)
  if (emptyIndex === -1) return placement
  const slots = [...placement.slots]
  slots[emptyIndex] = key
  return {
    slots,
    tray: placement.tray.map((item) => item.key === key ? { ...item, placed: true } : item),
  }
}

export function removeWordBuilderSlot(placement: WordBuilderPlacement, index: number): WordBuilderPlacement {
  const key = placement.slots[index]
  return key ? removeWordBuilderTile(placement, key) : placement
}

function removeWordBuilderTile(placement: WordBuilderPlacement, key: string): WordBuilderPlacement {
  return {
    slots: placement.slots.map((slot) => slot === key ? null : slot),
    tray: placement.tray.map((item) => item.key === key ? { ...item, placed: false } : item),
  }
}
