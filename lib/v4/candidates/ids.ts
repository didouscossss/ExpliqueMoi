/** Identifiants stables et uniques dans une session d’extraction. */

let seq = 0;

export function resetCandidateIdsForTests(): void {
  seq = 0;
}

export function nextCandidateId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}
