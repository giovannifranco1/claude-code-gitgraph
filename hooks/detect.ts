// A cheap pre-check before `git check-ref-format --branch` has the last word:
// never a flag, never whitespace or control characters.
export function isBranchNameCandidate(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.startsWith('-') && !/[\s\x00-\x1f\x7f;&|$`]/.test(name)
}
