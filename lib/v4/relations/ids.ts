let seq = 0;

export function resetRelationIdsForTests(): void {
  seq = 0;
}

export function nextRelationId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}
