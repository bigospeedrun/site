import Mathlib.Analysis.SpecialFunctions.Pow.Real
import Mathlib.Topology.Algebra.InfiniteSum.Real
import Mathlib.Order.Filter.AtTopBot.Basic

/-!
# Catalan's constant: an upper bound on its irrationality exponent

The constant is the series `∑ (-1)^j / (2j+1)^2`, as in Sean Litsey's
`Challenge.lean` (commit 50672b810873d8371b2b6bdd0057bb6cb2e3da24). The approximation
inequality has the same shape as the one in that file. Its form with a parameter is a
BigOSpeedrun adapter, written after the pull request of 1337isnot1337 (verifier #21).
Apache-2.0, see LICENSE.

`Bound r` says: for every real `s > r`, for all large denominators `b` and for every
integer `a`, `b^(-s) < |G - a/b|`. No fraction is excluded, so `a/b = G` fails the
inequality (the right side is then `0`). A proof of `Bound r` therefore also proves
that `G` is irrational.
-/

namespace BigOSpeedrun.Catalan

/-- Catalan's constant, as the literal series. -/
noncomputable def constant : ℝ :=
  ∑' j : ℕ, (-1 : ℝ) ^ j / ((2 * j + 1 : ℕ) : ℝ) ^ 2

/-- A strict, eventual approximation inequality at exponent `s`. The threshold on `b`
does not depend on `a`. Fractions need not be reduced. -/
def Endpoint (x s : ℝ) : Prop :=
  ∀ᶠ b : ℕ in Filter.atTop, ∀ a : ℤ,
    (b : ℝ) ^ (-s) < |x - (a : ℝ) / (b : ℝ)|

/-- `x` has irrationality exponent at most `r`: `Endpoint x s` for every `s > r`. -/
def UpperBoundFor (x r : ℝ) : Prop :=
  ∀ s : ℝ, r < s → Endpoint x s

/-- Race target. A smaller nonnegative rational bound is better. -/
def Bound (r : ℚ) : Prop :=
  0 ≤ r ∧ UpperBoundFor constant (r : ℝ)

end BigOSpeedrun.Catalan
