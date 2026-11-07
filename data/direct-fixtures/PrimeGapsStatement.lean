import Mathlib.Data.Nat.Nth
import Mathlib.Data.Nat.Prime.Defs
import Mathlib.Order.Filter.AtTopBot.Basic

/-!
# Bounded gaps between primes

`Bound B` says: infinitely often, two consecutive primes differ by at most `B`. With `p n`
the `n`-th prime (`Nat.nth Nat.Prime n`, so `p 0 = 2`), this is `H₁ ≤ B` for
`H₁ = liminf (p (n + 1) - p n)`. A smaller `B` is better; `Bound 2` is the twin prime
conjecture.

The form is Axiom Math's `bombieriVinogradov_implies_frequently_prime_gap_le_246`
(AxiomMath/PrimeGapsLib, `PrimeGaps/Bounded246.lean` at commit
1faa7b14e82ddebc2772dfb9153922f01b106477, Apache-2.0) with `246` replaced by `B`, without its
Bombieri-Vinogradov hypothesis. See README.md and provenance.json.
-/

namespace BigOSpeedrun.PrimeGaps

/-- Race target. Infinitely often, consecutive primes differ by at most `B`. A smaller natural
bound is better. -/
def Bound (B : ℕ) : Prop :=
  ∃ᶠ m in Filter.atTop, Nat.nth Nat.Prime (m + 1) - Nat.nth Nat.Prime m ≤ B

end BigOSpeedrun.PrimeGaps
