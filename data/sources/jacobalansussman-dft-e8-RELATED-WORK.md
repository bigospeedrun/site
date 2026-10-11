# Related work and credits

Author of this repository: Jacob Sussman. Repository: https://github.com/jacobalansussman/wht-power-saving-lean.

This file says what this work takes from others, what it shares with work that others published first, and
where the other results stand. It rests on read-only looks at public sources by the AI agents I directed. The
first three were
a scan on 2026-10-08 at about 21:10 UTC, a scan on 2026-10-09 ending 10:39 UTC, and a re-read of 20 pull requests
and 4 repositories on 2026-10-09 from 11:46 to 11:55 UTC. For the second result they looked again on 2026-10-09:
a read-only fetch of six pull-request heads at 13:17, reads of pull requests #192 to #198 at 14:02, a list of
titles at 14:37, and a look at 16:06 (section 5). For the third result: a read of three repositories at
17:15 on 2026-10-09, and a last look at 18:11 on 2026-10-09 (section 5).

For the fourth revision they read more on 2026-10-10:

- For the credits of section 1: the descriptions of pull requests #161, #162, #163 and #168, and the scripts
  that NOTICE, section 6, names. The figures of section 5 were not looked at again.
- For the fourth result: the 100 newest pull requests of CrocSwap/integer-mult-bounds, #233 to #332, in one
  read at 20:49 on 2026-10-10 (section 8).
- For the sentence about the largest saving with a Lean proof: the repositories for the Fourier statement
  and the list of the community's pull requests again, between 21:25 and 21:35 on 2026-10-10 (section 8,
  "The look of the evening of 2026-10-10").

**All times are UTC.**

Rules of this file:
- Every outside figure is **a claim of its authors**. How they checked it is stated next to it. The authors of
  the pull requests quoted here label each of their figures "conditional".
- **Which number is quoted.** The titles of the pull requests to CrocSwap/integer-mult-bounds give kappa, the
  saving for integer multiplication. The figure that compares with mine is the "complex side" saving, which is
  in the body or the notes of a pull request. This file quotes the complex-side saving, and writes "kappa"
  where only a title was read. Example: the title of #178 says kappa = 6.5592e-4, and its body gives the
  complex-side saving 13126968687/(2 * 10^13) = 6.5634843e-4. In the five pull requests where the agents compared
  the two (#130, #144, #155, #168, #178) the complex-side saving is a little above the kappa of the title.
  In #193 it is 5 percent above: complex side 7.009184e-4, kappa 6.647872e-4.
- No outside checker was run. One outside Lean development was built: pull request #2 of this repository,
  which the agents built on a Linux machine on 2026-10-10 (section 8). No other outside Lean development was
  built. For the rest the agents read sources and recomputed
  some arithmetic. For the second result they also loaded published data files into the programs that are
  now in `tools/rebuild/`. They made those programs in part by adapting the outside scripts (section 1;
  NOTICE, section 6).
- People are named by their GitHub handles, as in the sources.
- "Not found" means: searched for and not found. It does not mean "does not exist".
- The field moved every 10 to 30 minutes while this was written. Section 5 is out of date by the time you read it.

"Saving" is 1 - z in a bound n (log n)^z. My figures are 7.474547e-4 (the second result) and 5.399225e-4 (the
first), both in whole-block accounting, both Lean theorems for the Walsh-Hadamard statement described in the
README; and 7.474546e-4 (the third result), a Lean theorem for OpenAI's own Fourier statement of every
length, from the kernel program of the second. The fourth result, of 2026-10-10, has Lean theorems at two more
figures: 8.762479e-4 for the Walsh-Hadamard statement and 8.762478e-4 for the Fourier statement of every
length. They come from a new unit (section 8).

## 1. What this work takes from others

**OpenAI, [openai/math](https://github.com/openai/math), family 130, "Exact Fourier transforms below n log n"**
(commit `fd4aeeb`, Apache-2.0). Everything here is built on it: the theorem and the idea of the proof; the RAM
cost model, which is copied byte for byte into my statement; the recursion engine and program framework, which
this repository imports unchanged (89 files) and generalises. Their result is the discrete Fourier transform of
every length with saving 10^-13, proved in Lean. Their two comparator challenges passed when I had the agents
re-run them. The tensor engine in their Lean has saving 2/10^11. The two manuscripts of family 130 are "Finite
tensor savings and exact Fourier circuits" and "An explicit power saving for the exact discrete Fourier
transform" (OpenAI, 25 September 2026, in `preprints/` of openai/math). Section 7 reproduces their BibTeX
entries. OpenAI did not write, review or endorse this repository.

**OpenAI's reduction from the kernel program to every length (third result).** The third result takes the
whole of it. OpenAI's Lean proof uses the network through one theorem, `hills_program`
(`TensorProgram.lean`), which has one call site (`SectorAlgorithm.lean`). The 11 files of theirs that follow
(`SectorAlgorithm`, `SynchronizedAlgorithm`, `WorkingTransform`, `WorkingCompiler`, `WorkingPreparation`,
`ArbitraryLength`, `TransformProgram`, `ConvolutionProgram`, `UniformBounds`, `Asymptotics`, `Main`) are
repeated under `Work/Fourier/` with one constant changed, the exponent, and with every declaration renamed.
The copies say so in their first lines, and NOTICE, section 7, lists them. The statement is OpenAI's
challenge file `lean/ComparatorChallenges/UniformFourier.lean` with the exponent replaced. What this
repository adds to it is the kernel program at the larger exponent, in the form of that one theorem
(`Work/Fourier/Seam.lean`).

**Who carried a larger saving to the Fourier statement first.** Three outside works did, and the third result
follows them:

- **danadran01**, [danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving)
  (`1a7b25e`, 2026-10-09 03:48; Apache-2.0 by its README). Lean, on OpenAI's own `DFTProgram` and
  `TimeBounds`, saving 3.2e-6 (`transform_improved`, `improvedExponent = 1 - 32/10^7`). As far as my scans
  found, it is the first Lean improvement of the Fourier statement. It is a modified copy of OpenAI's Lean
  with three of OpenAI's files changed (`TensorSaving`, `TensorProgram`, `Main`), all at the place where the
  network enters; by a file comparison of the agents every other OpenAI file in it is byte-identical to the
  one here. Its recursion is whole-block ("grouped recursion"). Its record reports a clean build, the standard
  axioms and `leanchecker`; a comparator configuration is included and no comparator run is reported. It was
  not built here. The third result does not use its code: the engine of this repository has letters that its
  recursion does not have (helper arrays that start at zero, an additive bijection of the labels, a phase),
  so the route here goes through OpenAI's own theorem.
- **shea256**, [shea256/fourier-transform-below-nlogn](https://github.com/shea256/fourier-transform-below-nlogn).
  The first written transfer of a community network to the family-130 model (first commit 2026-10-08;
  eumemic's README: "That work has priority for the idea of the transfer"). Written argument and finite
  Python checks, not Lean; section 5 has its figures.
- **eumemic**, [eumemic/exact-dft-bounds](https://github.com/eumemic/exact-dft-bounds) (`6f87d1a`). A written
  transfer with batched recursion, every saving below 4.856e-4 with an extra log log factor. Its README
  states the observation that the third result rests on, for OpenAI's manuscript: "OpenAI's Sections 3–5
  (exact-width Fourier words, sector synchronization, small-prime working lengths, chirp convolution) use
  their Theorem 2.6 only through three things: the bound O(2^k (k+1)^θ), the fact that only rational
  constants and i are needed (their §5.3), and its word-size accounting." Its Theorem 3.1 is the sentence
  that the generalised engine of this repository proves in Lean. "A paper proof with an exact finite
  certificate, and it is not formally verified."

**The helper circuit of the second result: the community's paired-cube circuit, in the state of pull request
#193 to [CrocSwap/integer-mult-bounds](https://github.com/CrocSwap/integer-mult-bounds)** (Apache-2.0). This is
the largest thing the second result takes from others. The circuit is theirs in every part:

| part | author and pull request | read at |
|---|---|---|
| paired cubes: ports on coordinate pairs, eight-port cubes, coordinate-star centres | icekylinx, [#144](https://github.com/CrocSwap/integer-mult-bounds/pull/144), created 2026-10-09 04:19:35, in main since 05:06 (through #149). Its notice credits an664, #128, for "the substantial completed-core workspace-sharing principle" and says that its queries "restrict the retained eumemic PR #117 positive DAG" | main `d1d6c07` |
| modules, carrier links, frames and physical layer at p = 11 ("PR168 v4") | eumemic, [#168](https://github.com/CrocSwap/integer-mult-bounds/pull/168), created 08:22:16 | head `4a3c769` |
| source-parity local word (a + b and a - b from the same two arrays) and source-assisted frame flow | icekylinx, [#184](https://github.com/CrocSwap/integer-mult-bounds/pull/184), created 11:32:18, closed | its body, and its files in the tree of #193 |
| the same construction on the modules of #168 v4 | ikeboy, [#191](https://github.com/CrocSwap/integer-mult-bounds/pull/191), created 12:16:23 | head `15fa62d` |
| hand-over pairs chosen so that no donor is erased; complex side 7.009184e-4 | ikeboy, [#193](https://github.com/CrocSwap/integer-mult-bounds/pull/193), created 12:36:35 | head `187e101` |

- #193 gives its credits in these words: "icekylinx (PR184, with GPT-6 Astra and Codex assistance) for the
  method, the tools and the bit supplier. eumemic (PR168 v4, with Claude assistance) for the query modules and
  the physical layer. Package by Avi Eisenberg with Claude assistance." The citation file of the repository
  (at `4a3c769`) asks to cite icekylinx's paired-cube construction, an664's completed-core sharing and the
  constituent contributions, and names Douglas Colkitt as maintainer.
- Techniques inside these data that earlier pull requests introduced:
  - slot reuse at birth: jamesyc (#124) and eumemic (#143);
  - operation-frame descent: eumemic (#131), and #168;
  - source gauges: icekylinx (#115 and #144);
  - carrier links (below), and their compilation under the closure condition of #162 (DaysSky);
  - merged output reads: eumemic (#161), in the form that #168 gives them. In that form each port's three
    single-target outputs are fused into one. In the words of #168, this fusion
    "follows #163's same-singleton fusion" (#163, chafreaky). The fold orders are #168's own.
- The branch of #193 is stacked on #191, and #191 on #185 (rohanarun) with #184 merged. The shared-edge local
  circuit of #181 (chafreaky) and its successors #186 (Dugongue) and #195 (huxint) are another line: by the
  agents' rebuild the word of #193 has the local circuit of #184, not the shared-edge one.
- **What the agents loaded.** They read the scripts as text and ran none. They loaded these published files as
  data. From #168 (`4a3c769`): `references/paired-cube/sources/local_L1.json`,
  `tmod_TE_TD_TB3_1_1_4_full_6.0617964e-4.json`, `pmod_J0_full_6.0666810e-4.json` and `qmod_climb3u_best.json`
  in the same directory (modules), `references/paired-cube/selected-module/matching-arcs.json` (carrier links)
  and `references/paired-cube/physical/frames.json` (frames). From #193 (`187e101`):
  `research/source-assisted-v4/data/physical-pairs.json` (pairs). Thirteen files of #168 were compared by blob
  hash with the tree of #193 and are equal.
- **What the agents made of it.** They made the programs that are now in `tools/rebuild/`, in part by
  adapting the scripts of these pull requests. [NOTICE](NOTICE), section 6, names the scripts and their
  authors. Those programs rebuilt the circuit and reproduced the published counts
  of #193: 9,412 helper arrays, 12,052 roles per vertex, rank mass 794,112, and the histogram of block ranks. The
  result is one explicit list of additions. #193 itself publishes a ledger (counts per frame) with local checks.
  Each of its 1,980 in-place steps is written here as two ordinary additions.
- **What was checked before, and what is checked here.** #193 states the scope of its own validation: "The
  exact lift and the contract checks establish the local maps and the flow ledger. There is no globally
  renumbered scalar transcript of the new complex word and no full Clifford/router replay." The Lean directory
  of that repository (`formal/lean`, as read at `4a3c769`) holds certificate arithmetic and two algebraic facts
  about the labels of an earlier circuit. As far as my scans found at the time of writing, the theorem of this
  repository is the first full machine check of the #193 circuit, as rebuilt here. It checks the circuit inside
  my layout and for my statement. It does not check their theorem on integer multiplication.
- A newer pull request, [#196](https://github.com/CrocSwap/integer-mult-bounds/pull/196) (chafreaky, 13:23:42),
  has another cube circuit with a smaller complex side (6.6549e-4) and claims a fuller check of it (both
  directions, every dirty column).

**The general frame lemma.** The statement is the community's: CrocSwap `notes/general-clifford-frames.tex`
has it for arbitrary binary subspaces, "including degenerate subspaces", with one recursive child per nested
step. Every outside figure above 7.4e-5 depends on it. Its Lean proof for the family-130 RAM model
(`Work/GFrame`) is in this repository, with the two free adapter steps it needs and the proofs of their cost.

**Whole-residual batching** (the accounting behind both of my figures). Community follow-ups to OpenAI's
sibling result on integer multiplication apply the whole residual of a network edge, of rank r, as one
recursive call. The earliest that the agents found is pull request #10 to
[CrocSwap/integer-mult-bounds](https://github.com/CrocSwap/integer-mult-bounds) (icekylinx, 2026-10-08 08:26):
"Apply whole complex residuals as recursive calls". shea256's manuscript (below) credits further complex
batching to eumemic (#15). The "whole-block" recursion of this repository is that idea, proved in Lean for the
family-130 RAM model: in the first engine for runs of unit moves, in the generalised engine for blocks between
nested subspaces. The Lean development of danadran01 (section 5) formalises
the same accounting under the name "grouped recursion".

**The helper circuit NStar3 and the two-stage word** (first result). The first result takes them from round six of
[Swapnil-jain/integer-mult-kappa](https://github.com/Swapnil-jain/integer-mult-kappa) (NStar3, two stages,
copied centres), the "complex side" network of that integer-multiplication follow-up. That repository names its
own sources: it builds on OpenAI's "Integer multiplication below n log n" and on the framework of the CrocSwap
repository (Douglas Colkitt); it has the copied centres "after PR #36's copied retained-centre schedule"
(CrocSwap #36, icekylinx, 2026-10-08 12:27); and it attributes its two-stage construction to "Paureel's
two-stage motif". #36 itself says that it "adopts the attributed two-stage and corner contributions from
Paureel". shea256 transferred the round-six
network to the family-130 RAM model in
[shea256/fourier-transform-below-nlogn](https://github.com/shea256/fourier-transform-below-nlogn) (commit
`bf38c00`) and proposed a saving of 7.3e-5. Checked by its author with a written argument and finite Python
checks, not in Lean. Its README describes the network as "Swapnil Jain's round-six complex network, building on
work by Douglas Colkitt, icekylinx, eumemic, and Aurel Prosz / Paureel". The agents put that network into
Lean before they changed the layout. The helper circuit of the first result still has NStar3's sums as its
starting point.

**Carrier links.** At an addition n = a + b one argument slot becomes the sum and the other rests. A link hands
the resting slot to a later use of the same value, which saves one helper array. The idea is from CrocSwap pull
requests #24, #32 and #36 (icekylinx), with a weighted version in #44 (rohanarun) and link-friendly circuits in
#53 and #62 (ikeboy). Checked by their authors in Python and C++. The agents applied it to NStar3 with a maximum
matching. The circuit of the second result comes with its authors' own carrier links: `matching-arcs.json` of
#168 has 10,704 links. #168 says that they were compiled with the `compile_closure` of #162 (DaysSky). The
rebuild carries 10,044 of them over to the word of #193 (the word is the network written as a sequence of
stages).

## 2. Ideas developed here that others published first

This section is about the first result.

Four of the design steps in the README were worked out inside my project. Its first scan (2026-10-08, about
21:10) found none of them in public, and the project did not look outside again until the second scan. In that
interval others published the work below. Nothing of mine was published. The outside work is therefore
independent of mine, and **priority in the public record is theirs.** I claim none.

| idea (README, section 6) | public record | how close |
|---|---|---|
| Layout on a group of isometries with label dimension linear in h; a third stage | CrocSwap [#130](https://github.com/CrocSwap/integer-mult-bounds/pull/130) (icekylinx), created 2026-10-09 02:29:02, merged 05:06:02: "three invocation banks on a regular Cayley cover in dimension `3h-2`" | same idea, three stages |
| One helper set for all stages | [#137](https://github.com/CrocSwap/integer-mult-bounds/pull/137) (eumemic), 03:18:33, open; [#144](https://github.com/CrocSwap/integer-mult-bounds/pull/144) (icekylinx), 04:19:35, merged 05:06. Inside one stage: #128 (an664), 01:35:20 | same idea. In theirs each core finishes its clean-up before the next stage starts |
| Data arrays as carriers: sources used in place, pair labels, the cube of eight ports | #144 (icekylinx): "1,760 ports grouped into eight-port cubes"; "This adds no K auxiliary bank". The construction is in its note `notes/paired-cube-construction.tex` (CrocSwap main `d1d6c07`): "Ports with the same three pair labels form an eight-port cube". Cube producers appear earlier, in #115 (icekylinx, 00:26:56) | same idea on the input side. Output side related: terminal sinks, #166 (jamesyc), used in #168 |
| Searching over the order of the additions | #111 (rohanarun), 00:04; #167 (GamingPuzzled), 08:15; [#168](https://github.com/CrocSwap/integer-mult-bounds/pull/168) (eumemic), 08:22 | related: the same lever on other circuits, none of them NStar3. An earlier outside test of other tree shapes on NStar3 itself reported no gain (sobakadog8, 2026-10-08 20:13) |

The timestamps that I can show for my project are local ones. The private note that first describes the folded
layout, with one helper set serving three stages, has the file time 2026-10-08 23:32:10. Pull request #130 was
created on 2026-10-09 at 02:29:02. My project's first Lean theorem with a three-stage layout passed the
comparator at 02:38 on 2026-10-09, nine minutes after #130 appeared; the one with a shared helper set passed at
02:47. A local file time or log time is not a public record, and nobody outside can verify it.

## 3. What the scans did not find elsewhere

- **The bridged word.** A twin for every pair on the same line, so that two pairs are exchanged with five
  invocations in place of six, and the five-stage layout with m = 5h. Not found by any of the ten scanning agents.
  The nearest outside relative is "lockstep" pairing (#132, ikeboy), which its author withdrew as invalid.
- **A Lean proof at this exponent.** The largest saving in an outside Lean theorem that the agents found is 3.2e-6
  (section 5, row D). Row D is a theorem about the Fourier statement of every length, so this holds for the
  third result as well as for the first two.
- **A Lean proof of the general frame lemma**, and **a machine check of a whole circuit of the paired-cube
  family** (section 1). Added with the second result.

The first two statements are as of 10:39 on 2026-10-09 and are limited by what the scans covered (section 6).
The re-read at 11:46 looked at the titles of the newer pull requests only and found no new commit in the
repositories of Swapnil-jain, eumemic, danadran01 and shea256. The later reads for the second result (13:17 to
14:37) were made to rebuild the circuit, not to search; they reported no five-stage layout and no Lean proof of
these kinds, and the repositories of eumemic and danadran01 still had no new commit at 14:37. The last look
(16:06, section 5) read the bodies of #193 to #207: none describes a five-stage layout or a Lean check
of its circuit, and those two repositories still had no new commit. The read at 17:15 and the last look at
18:11 (section 5) are the basis for the third result. All three statements are therefore "as
far as my scans found at the time of writing".

## 4. How my figures compare with the outside figures

- **Fourth result.** My 8.762479e-4 is for another circuit than any outside figure. It is for a unit on 120
  labels of width 9, found by this project's search (section 8). A unit is the finite network that a saving
  is computed from. The outside figures for the same quantity are for the community's paired-cube circuit at
  h = 22 or h = 20 in the five-stage layout. Mine is a Lean theorem of this repository. Section 8 says how
  each outside figure is certified.
- **Second result.** My 7.474547e-4 and the complex side of #193, 7.009184e-4, are the same circuit in two
  layouts: their word has three stages, mine has five (the bridged word, section 3). By the agents' computation
  the circuit of #193 in a three-stage word gives 7.0091e-4, their figure. So the difference is the layout and
  nothing else. Mine is a Lean theorem of a transform statement. Theirs is a figure inside the
  integer-multiplication project, certified by Python programs; as far as my scans found, it has not been
  turned into a Fourier theorem. Their headline, kappa, is a further and smaller number (rules above).
- **First result.** My 5.399225e-4 rests on my project's own circuit, without the general frame lemma. Outside
  figures passed it at 06:40 on 2026-10-09 (section 5).
- **The frame lemma.** Their counts rest on a frame lemma for arbitrary binary subspaces, "including degenerate
  subspaces" (CrocSwap `notes/general-clifford-frames.tex`), with one recursive child per nested step. When the
  first text was written the Lean framework of this repository did not have that lemma. A first look by the
  agents (2026-10-09, about 11:10 to 12:10: three reports, three counter-checks and a summary, by derivations
  on paper and tests on small arrays) reported, as the first text said:
  - The lemma itself held up, on paper and in tests on small arrays.
  - The recursion engine of the first result does not need unit directions. The layers above it do: its label
    calculus and its certificate checker work with unit directions and orthogonal projectors.
  - The lemma does not fit those layers as they are. For degenerate subspaces the outside frames are not in the
    family of frames that those layers use. Using them needs new free operations (a permutation of addresses
    and a phase that depends on the address), whose cost in the RAM model was then argued on paper only.
  - A substitute that stays inside that family of frames (another dot product) was tried on the frames
    published with #168. It works for one part of that circuit. With one dot product for the whole circuit
    it cannot work for the helper frames.
  - The lemma is necessary for the outside figures and not sufficient. The 6.56e-4 design also uses four further
    rules that the first engine and checker do not have, among them entrance gauges and slot reuse at birth. By
    the agents' count, 13,416 of the 15,149 operation frames published with #168 are degenerate subspaces.

  What followed is in the README, section 5. The lemma is now proved in Lean here, with the two free operations
  and their cost, in a generalised engine and a new checker beside the old ones. In the certificate format of
  the second result the further rules that #193 uses are ordinary additions and tests of the checker.
- Their stock of arrays is indexed by the whole orthogonal group O(66,2), described in writing and never built.
  Mine is indexed by O(110,2) for the second result and O(80,2) for the first, in the same way: defined in Lean,
  never enumerated.
- Outside figures use whole-residual accounting. They compare with my whole-block figures, not with my per-rank
  3.155781e-4. The agents found no outside per-rank figure.
- **Third result.** Rows C, D and E below are about the Fourier transform of every length, which is the
  statement of my third result. Mine, 7.474546e-4, is a Lean theorem checked by the comparator against
  OpenAI's challenge file with the exponent replaced. Row D, 3.2e-6, is a Lean theorem by its authors' record
  and was not built here. Rows C and E are written arguments, not formalised: every saving below 4.856e-4
  with an extra log log factor (eumemic), and 6.7e-4, which its author calls a proposed conditional
  transfer (shea256, state of 18:11 UTC on 2026-10-09, commit `a2840b1`). The networks differ: mine is the
  circuit of #193 in the
  five-stage layout, theirs are the networks named in those rows. The transfer is the same idea in all four,
  and it is OpenAI's reduction in every one.
- My first two results are about the Walsh-Hadamard transform. None of rows C, D and E has a figure for it.

Outside techniques and this work. The first result uses none of the following; the second uses those that are
in the data of #193:

- slot reuse at birth (#124, #143);
- operation-frame descent in bundles (#131, #168, #178);
- partial and pair-aware source gauges (#115, #144);
- extended carrier matching (#162, DaysSky);
- merged output reads (#161). In the published circuit they are #168's fusion of each port's three
  single-target outputs, which follows #163 (chafreaky);
- the paired-cube producer at p = 11.

Used by none of the first three results: terminal sinks (#166; #193 has none), the bit
side of the outside networks, and the transfer to every length without padding to a power of two (eumemic,
danadran01). The third result uses OpenAI's own transfer (section 1), and so does the fourth. The fourth
result has no bit side either. Section 8 says which devices its circuit uses.

## 5. Where the other results stood on 2026-10-09

**Read in full, state at 10:39.** The column "saving claimed" is the complex-side saving (see the rules).

| | saving claimed | what and by whom | how its authors checked it |
|---|---|---|---|
| A | 6.5634843e-4 | CrocSwap [#178](https://github.com/CrocSwap/integer-mult-bounds/pull/178) (rohanarun), a draft, created 10:28:58. Same network family ("complex side"), h = 22, m = 66. Title: kappa = 6.5592e-4 | Python checkers. Author: "Full repository verification and GitHub CI pending." CI was green at 10:39. No comments. Its interfaces "remain conditional assumptions" |
| A' | 6.5632e-4 | CrocSwap [#168](https://github.com/CrocSwap/integer-mult-bounds/pull/168) (eumemic), open, head `4a3c769`, 10:09:48. Title: kappa = 6.558894e-4 | Python gates, CI green, no review. "All of #144's interfaces remain assumptions." Two of the agents recomputed the figure from the published histogram (arithmetic only) |
| A'' | 6.1609676e-4 | [Swapnil-jain/integer-mult-kappa](https://github.com/Swapnil-jain/integer-mult-kappa), round ten, `d2f6146`, 09:38 | Python replays. Lean for the moment arithmetic only. Parts "stated here but not machine-checked" |
| B | 4.856569e-4 | CrocSwap main `d1d6c07` ([#144](https://github.com/CrocSwap/integer-mult-bounds/pull/144), merged 05:06), h = 24, m = 72. Title: kappa = 4.609169e-4 | Python, written notes, a maintainer review assisted by Codex: "no independent human peer review" |
| C | every saving below 4.856e-4, with an extra (log log n) factor | [eumemic/exact-dft-bounds](https://github.com/eumemic/exact-dft-bounds), `6f87d1a`, first commit 08:33. Fourier transform of every length, and convolution | "a paper proof with an exact finite certificate, and it is not formally verified" |
| D | 3.2e-6 | [danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving), `1a7b25e`, 03:48. Fourier transform of every length, on OpenAI's own `DFTProgram` and `TimeBounds` | **Lean.** Their record: a clean build, standard axioms only, `leanchecker`. A comparator challenge file is shipped; no comparator run is reported. **It was not built here** |
| E | 7.3e-5; 7.4026e-5; 5.1e-10; conditional 1e-9 | shea256; sobakadog8; teal-sea; a fork by whyihaveyou. Family 130 | written arguments or Python; the last one Lean arithmetic with open premises |
| | 5.399225e-4 | this repository, first result, Walsh-Hadamard statement, 09:59 | Lean, comparator, audits by AI agents; limits in the README |
| | 7.474547e-4 | this repository, second result, the same statement, with the circuit of #193, 15:14 | Lean, comparator, audits by AI agents; limits in the README |
| | 7.474546e-4 | this repository, third result, OpenAI's Fourier statement of every length (`DFTProgram`, and `ConvProgram`), from the kernel program of the second result, 18:27 | Lean, comparator, audits by AI agents; limits in the README |

**Titles only, state at 11:46.** Pull requests #179 to #185 had appeared. The agents read their titles, not
their bodies, so the figures are kappa and not complex-side savings: 6.5592e-4 (#179, chafreaky, open, 10:41),
6.5592e-4 (#180, M6LI, a draft, 11:10), 6.5918e-4 (#181, chafreaky, open, 11:10), 6.6022e-4 (#182, chafreaky,
open, 11:27), 6.5664e-4 (#184, icekylinx, closed, 11:32), 6.6063e-4 (#185, rohanarun, a draft, 11:41). #183
claims no new figure. #178 was still a draft. The repositories of rows A'', C, D and of shea256 had no new commit.

**Titles only, state at 12:37.** Pull requests #186 to #193 had appeared; again the agents read titles only.
Largest kappa in a title: 6.6479e-4 (#193, ikeboy, open, 12:36); before it 6.6263e-4 (#191, ikeboy, open, 12:16)
and 6.6189e-4 (#186, Dugongue, open, 11:54). #192 (DaysSky, open, 12:28) states a ceiling, "7.010e-4 for every
frame layout of #168's word", and no new figure. The hub's main branch and the repositories of rows A'', C, D had
no new commit.

**State at 13:12, front page and titles only.** The hub's main branch moved to `27d82eb` at 12:57 and now names
#186 (Dugongue) as its current reviewed result, with kappa = 6.61885549e-4; row B above is the state before
that. Pull requests #194 and #195 had appeared: 6.6743e-4 (#194, ikeboy, open, 12:43) and 6.6265e-4 (#195,
huxint, open, 13:00), both kappa from titles. Swapnil-jain/integer-mult-kappa published round eleven at 13:03
(`1a580dc`, "conditional witness kappa = 2^-10.547"). The repositories of rows C and D had no new commit. None
of this was read beyond the front page, the titles and the commit subjects.

**State at 14:02, pull requests #179 to #198 read by their bodies or certificates.** Complex-side savings as
their authors state them (the agents recomputed most of them from the published block lists): 6.5635e-4 (#179,
chafreaky), 6.6219e-4 (#181, chafreaky), 6.5708e-4 (#184, icekylinx, closed), 6.6232e-4 (#186, Dugongue, the
hub's reviewed result), 6.6307e-4 (#191, ikeboy), **7.009184e-4 (#193, ikeboy)**, 6.6309e-4 (#195, huxint),
6.6549e-4 (#196, chafreaky). #194, #197 and #198 change only the bit side and keep the complex word of #193;
the largest kappa in a title was 6.7608e-4 (#197, evmckinney9). Swapnil-jain round eleven: complex side
6.7147e-4. #192 (DaysSky) states a ceiling of 7.010e-4 for the frame layouts of #168's word; #193 says that it
"does not apply to this word".

**State at 14:37, titles only.** Pull requests #199 to #201 had appeared: kappa 6.678525e-4 (#199,
maxime-fleury), a bit-side figure (#200, chafreaky, a draft) and "A κ ceiling of 2.5592e-3 for every word on
#144's paired-cube design (no new κ)" (#201, DaysSky). The hub's main branch was at `3b6b668` (13:23).

**State at 16:06, the last look before this text.** Read from 15:52 to 15:53 and again from 16:06 to 16:07:
the list of the 30 newest pull requests, the bodies of #193 to #207 (#207 at 16:06, the others at 15:52), the
front page of the hub and the latest commits of three repositories. Pull requests up to #207 existed. Kappa in
the titles of the newest ones: 6.768823e-4 (#202, chafreaky, open, 14:39), 6.773148e-4 (#204, maxime-fleury,
open, 15:13; #199 now states the same figure), 6.830613e-4 (#205, rohanarun, open, 15:46), 6.830611e-4 (#206,
EcmaXp, created 15:49, closed by 15:52), 6.831905e-4 (#207, Dugongue, open, 16:00). #203 (huxint, 15:05) is a
study of barriers with no new figure. **The largest complex-side saving stated in any of these bodies was still
7.009184e-4**, the circuit of #193: #194, #197, #202, #204, #205, #206 and #207 keep it (they call it #193's
"complex supplier"; #207 writes its saving as 700918443859411/10^18 and says that it "makes no new
Lean-certification or practical-speedup claim") and change the bit side; #196 and #200 have a complex word of
their own at 6.6549e-4. #201 states a ceiling, not a result (complex side below 2.5657e-3 for every word on
#144's design). The hub's main branch was still at `3b6b668` (13:23); its front page named #186 (Dugongue) as
the current reviewed result, kappa = 6.61885549259598e-4. No new commit in danadran01/exact-dft-power-saving
(`1a7b25e`, 03:48, the Lean theorem with saving 3.2e-6) or in eumemic/exact-dft-bounds (`6f87d1a`, 09:34).
Swapnil-jain/integer-mult-kappa was still at round eleven (`1a580dc`, 13:03); its Lean files check certificate
arithmetic. None of the bodies of #193 to #207 describes a Lean check of its circuit or a five-stage layout. So
at that time the agents knew of no outside complex-side figure above my 7.474547e-4 and of no outside Lean
theorem for a Fourier or Walsh-Hadamard statement with a saving above 3.2e-6.

**State at 17:15, three repositories, read for the third result.** The agents cloned three repositories
read-only and read them; nothing in them was built or run. danadran01/exact-dft-power-saving was at `1a7b25e`
(the repository was created at 03:40; one commit; no issue or pull request had been opened), and
eumemic/exact-dft-bounds at `6f87d1a`: no new commit in either. shea256/fourier-transform-below-nlogn was at
`a2840b1`; at 15:24 it had raised its figure to 6.7e-4, with the network of round eleven of
Swapnil-jain/integer-mult-kappa. Its README: "The exact tensor witness is `a=0.00067147467` and the chosen
Fourier saving is `delta=0.00067`. This is a **proposed conditional transfer**, supported by a written
argument and finite checks. Independent mathematical review and end-to-end formal verification remain
pending." A file comparison showed that danadran01's tree differs from the OpenAI files of this repository in
three files (`TensorSaving`, `TensorProgram`, `Main`) and in no other.

**State at 18:11 on 2026-10-09, the last look before this text.** Read from 18:11 to 18:12: the list of the 30
newest pull requests with their bodies (#186 to #215), the latest commits of five repositories, the list of the
100 newest forks of openai/math with the branch names of the two pushed since 16:06, two repository searches,
and the README of shea256's repository at its head commit. Pull requests up to #215 existed. Kappa in the titles
of those after #207: 6.83921676706449e-4 (#210, eumemic, open, 16:58), 6.838479e-4 (#211, rohanarun, open,
17:14), 6.83847872497761e-4 (#213, sennemmi, open, 17:33). #208 (maxime-fleury, 16:52) prices a ladder of
further steps, up to kappa 1.226488e-3 with new residual types; its title calls them "target, not built", and
#215 (GamingPuzzled, 18:09) says that they need a mechanism other than the published one. #212 (chafreaky,
17:31) states a ceiling, not a result (kappa below 6.959e-4 on the bit word of #205 to #207). #214
(antoine-olivier, 17:44) replays the verifiers of four earlier pull requests. #209 (16:56) is my own entry: one
line that links this repository, with no kappa claim. **The largest complex-side saving stated as a result in
any of these bodies was still 7.009184e-4**, the circuit of #193: #210, #211 and #213 keep it and change the bit
side, and #213 says that it "adds no Lean proof". The hub's main branch was still at `3b6b668` (13:23). No new
commit in danadran01/exact-dft-power-saving (`1a7b25e`, 03:48), in eumemic/exact-dft-bounds (`6f87d1a`, 09:34),
in shea256/fourier-transform-below-nlogn (`a2840b1`, 15:24; its README still states delta = 0.00067) or in
Swapnil-jain/integer-mult-kappa (`1a580dc`, 13:03). Two forks of openai/math had been pushed since 16:06
(grwtsk/openai-math, akashlevy/math); by their branch names neither concerns the Fourier family. A search for
repositories pushed since 2026-10-08 that match "exact dft" returned those of eumemic and danadran01 and no
other. So at that time the agents knew of no outside complex-side figure above my 7.474547e-4, of no outside
Lean theorem for a Fourier or Walsh-Hadamard statement with a saving above 3.2e-6, and of no outside written
figure for the Fourier statement above 6.7e-4.

How the largest outside complex-side claim for this network family moved during the night (all
Python-certified claims): 7.4e-5 (first scan) -> 3.148e-4 (#130, 02:29) -> 4.139e-4 (#137, 03:18) ->
4.856569e-4 (#144, 04:19) -> 5.1135e-4 (#152, 06:05) -> 5.514156e-4 (#155, 06:40, the first above my final
figure; closed at 06:54 as superseded by #157) -> 5.6228e-4 (#157) -> 5.8857e-4 (#161, 07:23) -> 6.5632e-4
(#168, 10:09) -> 6.5635e-4 (#178, 10:29) -> 6.6219e-4 (#181, 11:10) -> 6.6232e-4 (#186, 11:54) -> 6.6307e-4
(#191, 12:16) -> 7.009184e-4 (#193, 12:36). The last four are among the pull requests that the agents read in
full; others of those hours were read by title only.

The agents found no lower bound or impossibility result for this problem in public sources. Only limits for
particular routes exist.

## 6. How this record was made, and its gaps

- Two scans by AI agents (the second: five scanners, five sceptics, one synthesis), read-only: public GitHub
  pages and API reads, arXiv, MathOverflow, Hacker News. Nothing of mine was sent anywhere. Nothing downloaded
  was executed. Each figure in rows A to D was read by at least two agents and fetched again at 10:35 to 10:39.
  Row E rests on the scanners' readings alone.
- A third look by one reviewing agent (11:46 to 11:55): 36 unauthenticated reads of the public GitHub API. It
  confirmed the number, author and time of 20 of the pull requests named in this file and read the titles of
  the newest ones.
- Further reads for the second result, all read-only: at 13:17 one shallow `git fetch` of the heads of #181,
  #186, #191, #192, #193 and #194 and of main (`27d82eb`), and the bodies of eight pull requests; at 14:02 the
  bodies of #192 to #198 and the certificate of #196; at 14:37 the list of titles up to #201; at 14:42 author
  and title of eight older pull requests; at 15:52 and again at 16:06 the list of the 30 newest pull
  requests, the bodies of #193 to #207, the front page of the hub and the latest commits of three repositories
  (section 5). Scripts were read as text and none was run. Published JSON files were loaded as data
  (section 1).
- Reads for the third result, read-only: at 17:15 on 2026-10-09 shallow clones of danadran01/exact-dft-power-saving,
  eumemic/exact-dft-bounds and shea256/fourier-transform-below-nlogn, read as text and compared file by file
  with the OpenAI files here; no outside program was run and no outside Lean was built. The last look
  (18:11): 15 read-only requests without authentication, from 18:11 to 18:12: 14 to the public GitHub API (the
  30 newest pull requests with their bodies, the latest commits of five repositories, the 100 newest forks of
  openai/math, the branches and events of two of them, two repository searches, the rate limit) and one for the
  README of shea256's repository at `a2840b1`.
- Reads for the fourth revision (2026-10-10), read-only and without authentication. Through the public GitHub
  API: the pull requests #161, #162, #163, #168, #233 and #304. As text: scripts of #144, #161, #162, #168
  and #193. No outside program was run. These reads were made for the credits of section 1 and for the two
  later figures that the README names. The scans of section 5 were not repeated.
- One more read for the fourth result, read-only: at 20:49 on 2026-10-10 one request to the GitHub API for the
  100 newest pull requests of CrocSwap/integer-mult-bounds (#233 to #332) with their descriptions (section 8).
  Nothing was fetched from their branches and nothing was run.
- A last look for the fourth result, read-only, by three agents between 21:25 and 21:35 on 2026-10-10:
  requests to the public GitHub API and GitHub's repository search, arXiv by title and abstract, and Hacker
  News. It covered the repositories for the Fourier statement (danadran01, eumemic, shea256, and
  xangma/exact-fourier-circuits, which is new to this file), pull request #2 of this repository, the list of
  the community's pull requests up to #334, and the forks of openai/math pushed since 2026-10-09 (not every
  branch). In this look nothing was built and nothing was run (section 8).
- One outside Lean proof was built for the fourth result: pull request #2 of this repository, at its head
  `837dc31`, on a Linux machine, between 20:38 and 21:51 on 2026-10-10 (section 8).
- Covered: openai/math and its forks (every branch of the roughly 65 forks pushed since 2026-10-07); the
  CrocSwap pull requests up to #178 (#169 to #177 by title and summary only) and those named in the line
  above; the repositories named above.
- Not reached: X / Twitter, the openai.com page, a paywalled newspaper article. GitHub code search does not
  index day-old repositories. Private repositories cannot be seen.
- The medium-confidence part: whether the outside claims are correct. The agents checked their arithmetic
  only. The exception is the circuit of #193, which the second result checks in Lean as rebuilt here.
- If you know of work that should be credited here and is not, please open an issue at https://github.com/jacobalansussman/wht-power-saving-lean.

## 7. How to cite OpenAI's manuscripts

openai/math asks that its manuscripts be cited with the BibTeX entries of their directories. The two entries
of family 130, copied from `preprints/` of openai/math at commit `fd4aeeb`:

    @misc{OAI:Finite-tensor-savings-and-exact-Fourier-circuits-September-25-2026,
      author = {{OpenAI}},
      title = {{Finite tensor savings and exact Fourier circuits}},
      howpublished = {OpenAI Math Release preprint
                      \href{https://github.com/openai/math/blob/main/preprints/Finite-tensor-savings-and-exact-Fourier-circuits-September-25-2026/main.pdf}{OAI:Finite-tensor-savings-and-exact-Fourier-circuits-September-25-2026}},
      year = {2026}
    }

    @misc{OAI:An-explicit-power-saving-for-the-exact-discrete-Fourier-transform-September-25-2026,
      author = {{OpenAI}},
      title = {{An explicit power saving for the exact discrete Fourier transform}},
      howpublished = {OpenAI Math Release preprint
                      \href{https://github.com/openai/math/blob/main/preprints/An-explicit-power-saving-for-the-exact-discrete-Fourier-transform-September-25-2026/main.pdf}{OAI:An-explicit-power-saving-for-the-exact-discrete-Fourier-transform-September-25-2026}},
      year = {2026}
    }

## 8. The fourth result (2026-10-10): credits, and where the outside figures stood

**What the new circuit takes from others.** The agents I directed designed and found the circuit of the
fourth result on 2026-10-10 (README, sections 4 and 6). Three devices in it are other people's. In the list,
a helper is a helper array: an extra array that holds a partial sum.

- **The in-place pair**, from icekylinx
  ([#184](https://github.com/CrocSwap/integer-mult-bounds/pull/184)), carried in ikeboy's #191 and #193.
  It forms a + b and a - b on the two arrays that held a and b. The circuit of the second result has 1,980
  such steps. The new circuit has them too. Among them are kinds with other signs and with halves that the
  circuit of the second result does not have. In the integer programme that selects the shared
  sums, the in-place pair is one of the kinds of node.
- **The re-use of finished helpers with a compensating read**, from jamesyc
  ([#124](https://github.com/CrocSwap/integer-mult-bounds/pull/124)) and eumemic
  ([#143](https://github.com/CrocSwap/integer-mult-bounds/pull/143)). A helper that nothing reads any more
  takes a new value, and each target concerned first reads the old content with the opposite sign. Section 1
  names both for the circuit of the second result.
- **The late pairing rule**, from Chafik Boukhalfa (the account chafreaky, by his own statement):
  [#200](https://github.com/CrocSwap/integer-mult-bounds/pull/200) and
  [#233](https://github.com/CrocSwap/integer-mult-bounds/pull/233), and pull request #2 of this repository.
  The rule is the choice of which finished helper a new value takes. The search programs use his idea as
  the rule that picks the finished helper, in a greedy rule written here. His program, his 2,310 pairs and
  his certificate were not used. On an earlier design of the same day, against a control with the opposite
  rule, that rule was 40 percent of the gain of the re-use pass. That is about 0.5 percent of that design's
  saving: 7.659352e-4 with the rule and 7.618803e-4 with the opposite rule. Both are prices computed in
  Python, with no Lean proof. It was not measured on the certificate of this revision.

Chafik Boukhalfa is credited in two more places: in section 1, for the fusion of single-target outputs
(#163) in the circuit of the second result, and in the README, for the hand-over pairs of #233.

A related idea that the new circuit does not take from its source:
[#304](https://github.com/CrocSwap/integer-mult-bounds/pull/304) (DreamingOfClouds) forms more shared sums
before the scatter, the one step that hands the totals to the targets. As far as I know, the sums
that the new circuit forms before the scatter were not taken from #304.

The integer programme is solved with HiGHS, an open-source solver, called through SciPy.

**What these credits rest on.** As far as I know, no agent of the first two rounds of the search read the
community's repository, CrocSwap/integer-mult-bounds. The attributions come from two places:

- the descriptions of the pull requests, which other agents of this project read on the morning of
  2026-10-10;
- the credits already in this file.

The commit history of that repository was not read for them. If a device here should be credited to someone
else, please open an issue.

**Where the outside figures stood at 20:49 UTC on 2026-10-10.** The table rests on one read of the 100 newest
pull requests of CrocSwap/integer-mult-bounds (#233 to #332): their titles and descriptions. Every figure is
a claim of its authors, as everywhere in this file.

| figure for the quantity of my Walsh-Hadamard theorem (five-stage layout) | whose | how certified, by its own text | mine is |
|---|---|---|---|
| 7795/10^7 (7795973/10^10) | [#327](https://github.com/CrocSwap/integer-mult-bounds/pull/327), DreamingOfClouds, 18:51, open; h = 20, 6,455 helpers | "two independent rational moment engines"; its author reports that it was "kernel-checked in Lean with Jacob Sussman's unchanged generator". Not built here | 1.1240 times it |
| 7635/10^7 (7635875/10^10 by `gxdry.py` here) | [#304](https://github.com/CrocSwap/integer-mult-bounds/pull/304), DreamingOfClouds, 12:01 UTC on 2026-10-10, open; h = 22, 9,160 helpers | scripts; its description said "no Lean build" | 1.1475 times it |
| 7547361/10^10 | the circuit of #193 with the pairs of #233 (Chafik Boukhalfa, chafreaky); his pull request #2 of this repository, open | pull request #2 reports a Lean kernel check of the Walsh-Hadamard statement at this figure and of the Fourier statement at 7547360/10^10, `tools/Compare.lean` "PASS for both" and a comparator run on Linux, "both accepted". The agents built the pull request on a Linux machine on 2026-10-10: all 54 Lean modules that it adds compiled, and `tools/Compare.lean` printed `RESULT: PASS` for both statements; after the build they ran the official comparator on the two configurations for which he reports runs, with a stand-in for its sandbox, and it accepted both (the record below). In this repository's own rebuild the figure is a price by `gxdry.py`, and `tools/rebuild/` reproduces it (README, "Whose circuit this is") | 1.1610 times it |
| 7474547/10^10 | the second result of this repository | a Lean theorem here | 1.1723 times it |

Among those 100 pull requests, the largest kappa in a title was 7.77268e-4 (eumemic,
[#332](https://github.com/CrocSwap/integer-mult-bounds/pull/332), 20:17 UTC). At 21:15 UTC #334 passed it
with 7.77596e-4 (the look of the evening, below). Kappa is the saving for integer
multiplication, and it needs a bit side as well (rules above). This repository offers none. The new unit
(the finite network that the saving of the fourth result is computed from) has not been tried as a
complex-side supplier for that project.

So as of that read and of the look of the evening (below), 8.762479e-4 is the largest saving with a Lean
proof that I know of for the Walsh-Hadamard
statement, and 8.762478e-4 for the Fourier statement. That claim covers only figures with a Lean proof, on
purpose. #208, an older pull request that is not among the 100, prices targets up to kappa 1.226488e-3 that
its own title calls "target, not built". The claim does not cover prices of that kind.

**The look of the evening of 2026-10-10 (21:25 to 21:35).** Three agents read the outside sources again,
read-only, for the sentence above. These three agents built nothing. Every Lean build below is as its author
reports it. There is one more thing to say of the first item: other agents built that pull request on the
same evening (the record after this list).

- **Pull request #2 of this repository**, by Chafik Boukhalfa (the account chafreaky), open, head `837dc31`.
  It states 1 - 7547360/10^10 for the Fourier transform of every length and 1 - 7547361/10^10 for the
  Walsh-Hadamard transform. It is his result: the circuit of his #233 in the five-stage layout of this
  repository. He reports the Lean build and the comparator runs for both. This was the largest outside
  figure with a Lean proof for the Fourier statement. The agents built it on a Linux machine on the same
  evening, and every module of it compiled (the record after this list).
- **shea256/fourier-transform-below-nlogn**, read at commit `62554f9` (04:53). Since commit `a101b36` (03:16)
  its selection is 7.547360e-4, marked "formalized", in place of the 6.7e-4 of 2026-10-09. Its words: "an
  incorporated upstream result with a reproduced Lean proof" and "it does not claim a new exponent of our
  own". The rebuild is reported by its author. It was not built here.
- **danadran01/exact-dft-power-saving**: still at `1a7b25e`, with 3.2e-6.
- **eumemic/exact-dft-bounds**: still at `6f87d1a`, with every saving below 4.856e-4, written. Its open pull
  request #1 (chafreaky) has written figures up to 7.099e-4, "not formally verified".
- **openai/math**: still at `fd4aeeb`.
- **xangma/exact-fourier-circuits**, which this file had not named. It has a Lean proof for the Fourier
  transform of every length with theta < 1 - 2/10^13 and an extra log log factor. That is about the size of
  OpenAI's saving. Its machine model is its own, so it is not the statement of this repository. It was not
  built here.
- **CrocSwap/integer-mult-bounds**, at 21:33. Two more pull requests existed, #333 and #334 (both eumemic).
  #334 has the largest kappa in a title, 7.77596e-4 (21:15), and keeps #327 as its complex side. Neither
  states a Lean build. The closed #246 (maxime-fleury) prices 8.3465e-4 for the complex side and calls it "a
  conditional priced target, not a witness". So the first row of the table is the largest complex-side
  figure with a reported Lean check, not the largest figure priced.
- **Also looked at:** the forks of openai/math pushed since 2026-10-09 (not every branch), GitHub's
  repository search, arXiv by title and abstract, and Hacker News.
- **Not looked at:** X, Zulip, Discord, forums, other code hosts, and the branches of forks of the
  community's repository that are not pull requests.
- **What was found:** no Lean proof, reported or built, of a saving of 8.7625e-4 or more for either
  statement. My 8.762478e-4 for the Fourier statement is 1.16 times the 7.547360e-4 of pull request #2. My
  8.762479e-4 for the Walsh-Hadamard statement is 1.12 times the 7.795973e-4 of #327.

**The build of pull request #2 of this repository, 2026-10-10 (20:38 to 21:51).** This is Chafik Boukhalfa's
result on his own hand-over pairs. On my Mac the build could not finish, so the agents built it on a Linux
machine.

- **Where:** a rented Linux machine (x86-64, Ubuntu 24.04, 51 GiB of memory), at the head of the pull request,
  `837dc31`, on top of a from-source build of the published tree of this repository (`f010392`) on the same
  machine.
- **The build:** all 54 Lean modules that the pull request adds compiled, with no error.
- **The two heaviest modules:** `Work.GCert.Data.Gen.P233Scal0` and `Work.GCert.Data.Gen.P233Scal1` built in
  574 s and 642 s. The largest process of each held about 13 GB (12.7 GiB and 12.8 GiB). The 54 modules took
  66 minutes in all, on a machine that other jobs shared.
- **The axioms:** his three theorems, `wht_main_block_B2Gp233x`, `transform_mainY` and `convolution_mainY`,
  depend on `propext`, `Classical.choice` and `Quot.sound`, and on no other axiom.
- **The statement check:** `tools/Compare.lean` printed `RESULT: PASS` for his Walsh-Hadamard challenge and
  solution and for his Fourier challenge and solution, with the constant counts that he states (38871; 43381
  and 43404).
- **Not run in that build:** the official comparator. The agents ran it afterwards on
  `comparator/B2Gp233x.json` and `comparator/UniformFourier233.json`, the two configurations for which he
  reports runs. They used a second copy of that tree and a stand-in for the sandbox (README, section 3).
- **The comparator runs made afterwards:** the comparator accepted both configurations, each with
  `Lean default kernel accepts the solution`, `Your solution is okay!` and exit code 0. Each log has 176
  `Replayed` lines and no `Built` line. The time is the wall clock of the run, and the memory is the maximum
  resident set size that GNU `time` printed.
  - `comparator/B2Gp233x.json`: 22:58 on 2026-10-10 to 00:12 on 2026-10-11; 4455 s (1:14:15), 14443212 kB.
  - `comparator/UniformFourier233.json`: 23:00 on 2026-10-10 to 00:13 on 2026-10-11; 4388 s (1:13:07),
    14501748 kB.
  - The runs shared the machine, so the times are upper bounds.
  - These are not runs with the comparator's real sandbox: the kernel of that machine has no Landlock. He
    reports his own runs, with the real `landrun` sandbox.
- **Mathlib** was not compiled there. Its compiled files came from Mathlib's cache.
- **The Python checks** of his certificate were made on the Mac earlier that day, not on the Linux machine
  (README, "Whose circuit this is").
- **On the Mac** (16 GB of memory) 36 of the 54 modules built. The build could not finish there, because the
  two heaviest modules need about 13 GB each.
- **Not merged:** his files are in his pull request and not in this repository, so these three theorems are
  his and are not theorems of this repository. The README says why ("Whose circuit this is").
