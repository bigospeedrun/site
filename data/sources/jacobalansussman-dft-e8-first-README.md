# Discrete Fourier transform of every length in O(n (log n)^z), z = 1 - 8.762478e-4, checked in Lean

Author: Jacob Sussman. Repository: https://github.com/jacobalansussman/wht-power-saving-lean. Licence: Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)).

**What this is.** A proof, checked by the proof assistant Lean 4, that one fixed program computes the discrete
Fourier transform of every length n in O(n (log n)^z) operations with z < 1. This is OpenAI's own headline
statement, from their "Exact Fourier transforms below n log n" ([openai/math](https://github.com/openai/math),
family 130). The cost model is theirs too: a random-access machine (RAM) with exact arithmetic. I call 1 - z
*the saving*. OpenAI's statement has a saving of 10^-13.

**The new result.** The saving proved here is 8.7625e-4, for two statements. Both are new on 10 October 2026:

- the Fourier transform of every length, with z = 1 - 8762478/10^10; the file that states it also states
  convolution, and that is proved as well;
- the Walsh-Hadamard transform of the lengths n = 2^k, with z = 1 - 8762479/10^10. That is 1.1723 times the
  7.4745e-4 of my second result (+17.2 %).

This is the fourth result of this repository. The three earlier ones are still here and still stand
(section 1):

| Result | What is computed | Saving | Date |
|---|---|---|---|
| fourth | Fourier transform of every length, and convolution | 8.762478e-4 | new on 10 October 2026 |
| fourth | Walsh-Hadamard transform, lengths 2^k | 8.762479e-4 | new on 10 October 2026 |
| third | Fourier transform of every length, and convolution | 7.474546e-4 | published here on 9 October 2026 |
| second | Walsh-Hadamard transform | 7.474547e-4 | published here on 9 October 2026 |
| first | Walsh-Hadamard transform | 5.399225e-4 | published here on 9 October 2026 |

**How it was checked, and the limits.** Every proof here is checked by Lean's kernel, the part of Lean that
accepts or rejects a finished proof. The file that states the Fourier theorem is OpenAI's own statement file,
which they call a challenge file, with the exponent replaced (section 1 names the two other differences, a
comment and a suffix on seven names). The new proofs
have not yet had a line-by-line human review, and I would welcome one. Section 3 has every run and its limits.
Section 2 says what is not claimed; please read it before quoting the number.

**Who made it, and how.** I built this on 8, 9 and 10 October 2026 with a team of AI agents (Claude) that I
directed: the first result in about a day, the second in the hours after it, the third later the same day, the
fourth on the day after. I set the goals, chose which ideas to pursue, and decided at each stage what to do
next. The agents wrote the Lean proofs, designed the network, found the certificate (the data file that lists
the additions of its circuit) by computer search, and audited one another's work. Several of the design ideas
were found and published independently by other people during the same hours (section 4).

**This is not an OpenAI project.** OpenAI did not write, review or endorse it. Three kinds of their material
are here:

- The 89 files under `OAI/` are OpenAI's, unmodified.
- Under `Work/Fourier/` and `Work/FourierE8/` there are copies of OpenAI's files with changes. Each says so in
  its first lines, and [NOTICE](NOTICE), section 7, lists them.
- The name of the Lean (Lake) package, `OAI`, and the namespace `OAI.PowerSaving` are theirs. They are kept
  only because the new modules extend their development.

**Where the improvement comes from.** OpenAI's proof reduces the saving to a finite network: a fixed number of
working copies of the data (*arrays*), each to be transformed along a fixed number of directions, with a
schedule that needs fewer steps than the plain one. I call one such network a *unit*, and the program for the
lengths 2^k that is built on it the *kernel program*. The new result comes from a new and much smaller unit,
found by computer search on 10 October 2026. It has 1,263 arrays with 45 directions each (in the words used
below, a label space of dimension 45). The unit of the second and third results has 14,692 arrays with 110
directions each. The Fourier theorem is the same kernel program carried to every length; its saving is
smaller by 1/10^10.

**Whose work it rests on.** The step from the lengths 2^k to every length is OpenAI's reduction, repeated here
with one constant changed. The helper circuit of the second and third results, that is the scheme of additions
between their arrays, was made by the contributors of the public repository CrocSwap/integer-mult-bounds, whom
I call *the community*. Three devices in the new circuit are other people's too. The sections "Whose ideas the
new unit uses", "Whose reduction this is" and "Whose circuit this is" give the credit, and
[RELATED-WORK.md](RELATED-WORK.md) has the credits and the relation to other work.

**Where to look next.** Section 1 has the exact statements. Section 2 has what is not claimed. Section 3 and
[VERIFY.md](VERIFY.md) have the checks and how to repeat them. Section 9 has the dates, commits and outside
sources behind the statements, which are kept out of the prose.

## What is new in the fourth revision (2026-10-10)

There are five new things.

**1. A machine-checked saving of 8.7625e-4 for the Walsh-Hadamard transform, and for the Fourier transform of
every length and for convolution.** The three theorems are in this repository:

| Theorem | What it is about | Exponent z |
|---|---|---|
| `wht_main_block_B2Ge8x` | Walsh-Hadamard transform | 1 - 8762479/10^10 |
| `transform_mainE8` | Fourier transform of every length | 1 - 8762478/10^10 |
| `convolution_mainE8` | convolution | 1 - 8762478/10^10 |

All three are checked in three ways:

- by Lean's kernel;
- by the official comparator, the program that OpenAI's repository uses for its own results. It tests that a
  proof proves the statement of a given challenge file;
- by `tools/Compare.lean`, a second comparison script, which is in this repository.

All three checks were run on a Mac and on a Linux machine, and all passed on both. On both machines the 39
new Lean modules were compiled from source, in a tree that already held the compiled modules of the earlier
results. On both, the comparator ran with a stand-in for its sandbox, not with the real one. Section 3 has
the runs and their limits.

As of 10 October 2026 this is the largest saving with a Lean proof that I know of, for either statement. Here
is what that rests on.

- On that day the agents read the titles and descriptions of the newest pull requests of the community's
  repository, CrocSwap/integer-mult-bounds. Its contributors work on bounds for integer multiplication. One
  part of their figure, the "complex side", is the quantity of my Walsh-Hadamard theorem.
- The largest figure there for that quantity with a reported Lean check was 7.795e-4, by DreamingOfClouds
  ([pull request 327](https://github.com/CrocSwap/integer-mult-bounds/pull/327)). It is for the five-stage
  layout of this repository, the arrangement of the network in five stages that this repository uses
  (section 6). Its author reports a Lean kernel check of it, made with the
  generators of this repository (the Python programs that write its Lean files). It was not built here.
- The largest kappa in a title there was 7.77596e-4, by eumemic
  ([pull request 334](https://github.com/CrocSwap/integer-mult-bounds/pull/334)). Kappa is the saving for
  integer multiplication, which is another quantity (section 2, point 2).
- The claim covers figures with a Lean proof only. Prices without one, in that repository or elsewhere, are
  outside it. (A *price* is the saving that a program computes for a network. Without a Lean proof it is a
  computed number, not a theorem.)
- Those figures move within hours.
- For the Fourier statement the agents read the outside repositories again on that day. The largest outside
  figure with a Lean proof was 7.547360e-4. It is in pull request #2 of this repository, by Chafik Boukhalfa
  (the account chafreaky).
- That figure is his result. It is the circuit of his pull request 233 in the community's repository, in the
  five-stage layout of this repository. He reports the Lean build and the comparator runs.
- On 10 October 2026 the agents built his pull request on a Linux machine. All 54 Lean modules that it adds
  compiled. His three theorems depend only on the three standard axioms. `tools/Compare.lean` printed
  `RESULT: PASS` for his Walsh-Hadamard statement and for his Fourier statements. The agents did not run
  the official comparator on his files; he reports those runs himself. On my Mac the build could not
  finish, because two of his modules need about 13 GB of memory each. Section 9 has the details.
- shea256's repository now gives that same figure, where it had 6.7e-4 on 9 October. It reports its own
  rebuild of that proof and says that it "does not claim a new exponent of our own". That rebuild is
  reported by its author. It was not repeated here.

Section 9 lists what was read, and when.

**2. A unit of the kernel program that is an order of magnitude smaller.** Six words first.

- A *bank pair* is two data arrays that exchange their contents through additions. The exchanges are what
  saves steps.
- A *helper array* is an extra array that holds partial sums. Helpers save nothing, so their number is the
  main cost.
- A *move* transforms one array along one direction, and is what costs. A *block* is a run of moves of one
  array.
- The *label* of a pair is a word of bits, 9 bits wide in the new unit. The *label space* is the space of the
  m directions along which every array has to be transformed.

| | New unit | Unit of the second and third results |
|---|---|---|
| bank pairs | 120 | 1,320 |
| width of their labels | 9 | 22 |
| helper arrays | 783 | 9,412 |
| arrays in all | 1,263 | 14,692 |
| dimension m of the label space | 45 | 110 |
| one pass of the circuit | 9,039 moves in 3,974 blocks | 262,944 moves in 70,169 blocks |

Section 6 has the full table.

**3. The new unit needed no new Lean proof for the Walsh-Hadamard theorem.** The second result came with a
*certificate* format and a checker. A certificate is a data file that lists the additions of a circuit one by
one. The checker is a Lean function, with proofs that what it accepts is sound. The circuit of the new unit is
one more data file for that checker: `tools/certificate/gcert1-e8-r783.json.gz`. The Lean modules that hold
and check it were written from that file by the two generators of this repository, the Python programs
`tools/gx/gxgen.py` and `tools/gx/gxrate.py`, which are unchanged. The new circuit does use parts of the
certificate format that the
certificate of the second result never used (section 5).

**4. The search programs, and the account of the search.** `tools/e8/` holds the programs that found the
certificate. Four notes say how it went, and a fifth is for readers from another field. They are written for
people and for AI agents who want to take this further.

- [notes/how-the-e8-unit-was-found.md](notes/how-the-e8-unit-was-found.md): the design, and each step with its
  figure.
- [notes/what-did-not-work.md](notes/what-did-not-work.md): the routes that failed, told as plainly as the one
  that worked.
- [notes/e8-results.json](notes/e8-results.json): every figure in machine-readable form, each marked as
  Lean-checked here or as a price computed in Python.
- [notes/open-directions-2.md](notes/open-directions-2.md): what has not been tried and may be promising.
- [notes/for-network-coding-readers.md](notes/for-network-coding-readers.md) describes, for readers from
  network coding, the small coding problems that sit behind schedules of this kind, with what is checked,
  what is open and what I do not claim; the reading it starts from is that of pull request #288 of
  CrocSwap/integer-mult-bounds (eumemic), not mine, and nothing in that note is checked by a proof assistant.

**5. The scripts that rebuild the certificate of the second result from the community's data, and a
correction.** The scripts are in `tools/rebuild/`. Issue #1 of this repository asked for them. The correction:
six of those scripts are adaptations of the community's own scripts, and the earlier text called the generator
the agents' own (section "Whose circuit this is"; [NOTICE](NOTICE), section 6).

**Whose ideas the new unit uses.** The circuit of the fourth result is not the community's circuit of the
second result: the agents I directed designed it and found it by search. Three of the devices in it are other
people's, and the saving would be smaller without them:

- **The in-place pair.** Two arrays hold a and b, and a + b and a - b are formed on those same two arrays. It
  comes from icekylinx ([pull request 184](https://github.com/CrocSwap/integer-mult-bounds/pull/184) of the
  community's repository), and two pull requests by ikeboy carry it. It is in the circuit of the second result
  too.
- **The re-use of finished helpers.** A helper that nothing reads any more takes a new value, and each target
  concerned first reads the old content with the opposite sign. It comes from jamesyc
  ([pull request 124](https://github.com/CrocSwap/integer-mult-bounds/pull/124)) and eumemic
  ([pull request 143](https://github.com/CrocSwap/integer-mult-bounds/pull/143)).
- **The late pairing rule.** This is the choice of which finished helper a new value takes. It comes from
  Chafik Boukhalfa, the account chafreaky (pull requests
  [200](https://github.com/CrocSwap/integer-mult-bounds/pull/200) and
  [233](https://github.com/CrocSwap/integer-mult-bounds/pull/233) there, and pull request #2 of this
  repository). The search programs here apply his idea with a greedy rule of their own. His program, his pairs
  and his certificate were not used.

Which partial sums the circuit shares was chosen by an integer programme that the agents wrote and solved with
the open-source solver HiGHS. The Fourier and convolution theorems rest, as in the third result, on OpenAI's
reduction (section "Whose reduction this is").

What is mine in the fourth result:

- the new unit: the family of 120 labels of width 9 as a unit of this mechanism, the circuit on it, and its
  certificate;
- the search that found it, whose direction I chose, and the search programs in `tools/e8/`, which the
  agents wrote;
- from the second result: the certificate format, the checker with its soundness proofs, the generators, the
  five-stage layout and the generalised engine (the engine is the part of the proof that turns a schedule
  into one program with a time bound; section 5);
- the machine check of the whole.

[RELATED-WORK.md](RELATED-WORK.md), section 8, has the fuller credit, with what was and was not read at the
community's repository. The pull requests named here are listed once more in section 9.

## What was new in the first three revisions

All three revisions were published here on 9 October 2026. The searches of outside work behind this list were
made on that day.

- **Third result: a machine-checked proof of OpenAI's own headline statement, with the saving 7.474546e-4.**
  The statement is the discrete Fourier transform of every length. OpenAI's statement has 10^-13, and the
  fourth result now has 8.7625e-4. The statement file is OpenAI's challenge file with the exponent replaced
  (section 1). As far as I could find, the largest outside figures were these:
  - in an outside Lean proof of that statement: 3.2e-6
    ([danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving); not built
    here);
  - in an outside written argument: 6.7e-4 (shea256; conditional, not formalised). That repository gives
    another figure since 10 October 2026 (item 1 above).
- **Second result: a machine-checked saving of 7.474547e-4 for the kernel program and for the Walsh-Hadamard
  transform.** When I published it on 9 October 2026 it was the largest figure for this quantity that I could
  find anywhere. The largest outside figure was 7.009184e-4, certified by scripts: the "complex side" of the
  community's networks, in their pull request 193. It is not the largest any more. Larger figures for the
  five-stage layout of this repository (next item) are public. They are not theorems of this repository. Two
  of them are prices that its own Python tools compute:
  - 7.547361e-4 for the same circuit with Chafik Boukhalfa's hand-over pairs (the community's pull request
    233). The rebuild in `tools/rebuild/` produces that circuit and `gxdry.py` prices it. His own pull
    request #2 to this repository has that figure as a Lean theorem, which the agents built on a Linux
    machine (section "Whose circuit this is").
  - 7.635875e-4, the price that `gxdry.py` gives to the certificate of
    [pull request 304](https://github.com/CrocSwap/integer-mult-bounds/pull/304) by DreamingOfClouds. The pull
    request states 7635/10^7 for it.

  The fourth result of this repository, 8.7625e-4, is above both and is a Lean theorem.
- **A five-stage "bridged" layout.** As far as I could find, it was in no other work. The same helper circuit
  gives 7.009e-4 in the three-stage layout its authors use and 7.474547e-4 in this one. Since then others have
  taken the layout up: pull request 304, for one, applies the five-stage formula and credits this repository
  for the layout.
- **A Lean proof of the general frame lemma for this machine model.** As far as I could find, it was the
  first. It includes the cost of the lemma's "adapter" steps, which until now was argued on paper only.
  Section 5 says what the lemma is.
- **A certificate checker with soundness proofs.** A better circuit in its format is now a data file for it,
  not a new proof. The fourth result is the first result of this repository that uses it that way. Others
  used it first: by their own reports, DreamingOfClouds had the generators of this repository write Lean
  files for circuits of their own, and Lean's kernel accepted them (pull requests 315 and 327 of the
  community's repository; not built here).
- **A complete machine check of the community's circuit of pull request 193**, as rebuilt here from their
  published data (section 3 says what that rests on). As far as I could find, it was the first. Its own
  validation was local; its author's words are quoted in the section "Whose circuit this is".

Two things behind this list are not mine. The step from the kernel program to every length is OpenAI's
reduction, and the helper circuit of the second and third results is the community's. The next two sections
give the credit. Section 5 says in plain words what each of these items is.

The searches behind "as far as I could find" were read-only looks at public sources by the AI agents I
directed. They were not repeated in full for the fourth revision. On 10 October 2026 the agents read the
outside repositories named below again, and the newest pull requests of the community's repository.
RELATED-WORK.md says what the looks covered and when, and section 9 has the dates.

## Whose reduction this is

The step from the kernel program to the Fourier transform of every length is OpenAI's, in every part. The
kernel program is the core program, for the lengths 2^k; the Walsh-Hadamard theorem of the second result
rests on it too. The step from those lengths to every length is called the reduction here.

OpenAI's Lean proof uses the network through one theorem (`hills_program` in their `TensorProgram.lean`),
and that theorem is used in one place. The generalised engine of this repository proves the same sentence
with my exponent in place of theirs. So the third result needed no new mathematics after the kernel program.

**What is repeated from OpenAI.** OpenAI has 11 files between that theorem and their final statement. They
are repeated here with one constant changed: the exponent. The proofs are OpenAI's.

- **The files.** `SectorAlgorithm`, `SynchronizedAlgorithm`, `WorkingTransform`, `WorkingCompiler`,
  `WorkingPreparation`, `ArbitraryLength`, `TransformProgram`, `ConvolutionProgram`, `UniformBounds`,
  `Asymptotics` and `Main` (1,825 lines in OpenAI's repository). The copies are under `Work/Fourier/`. A script
  made them (`tools/fourier/mkchain.py`).
- **The constant.** In the copies:

  | in OpenAI's files | in the copies |
  |---|---|
  | the exponent `alpha` = 1 - 2/10^11 | `alphaZ` = 1 - 7474547/10^10 |
  | the work bound `hills`, defined from it | `hillsZ` |
  | the one use of `hills_program` | `hillsZ_program` |
  | the exponent of the final statement, 1 - 1/10^13 | 1 - 7474546/10^10 |

- **The names.** Every declaration of the copies has the letter `Z` in its name, so that Lean cannot take
  OpenAI's original for the copy, and the import lines point to the copies. Of the 167 declarations, 115 have
  the letter at the end of their own name. The other 52 have it on the name of the declaration they belong
  to, as in `WeftZ.transfer`.
- **Two further edits.** The first comment of each file names its own.
  - In the copy of `Main` the same constant stands once as a literal number, 2/10^11, and is replaced there
    too. The two final theorems of that copy also received a comment of their own.
  - In the copy of `SynchronizedAlgorithm` the name `canopy` is written out as `Grove.canopy` in 5 places,
    because in the larger environment of the copy the short name would mean another declaration.
- **The comments.** The script also put the letter on three names inside OpenAI's comments. The comments are
  otherwise OpenAI's and describe OpenAI's network.
- **A twelfth small file.** `Work/Fourier/Goal.lean` repeats the five definitions of OpenAI's `Goal.lean` that
  contain the exponent of the statement.
- **The copies are marked as modified.** Each begins with a comment that names the OpenAI file it is derived
  from and says what was changed, as the Apache-2.0 licence asks, and [NOTICE](NOTICE), section 7, lists
  them. OpenAI's own files under `OAI/` are unmodified, as before, and the proof still imports them.

**What is new Lean for the third result.** One file, `Work/Fourier/Seam.lean` (245 lines), written by the
agents. It states the kernel program of the generalised engine in the form that OpenAI's reduction asks for,
and proves the few facts about the work bound that the reduction uses.

**What the reduction costs.** A factor (log log n)^2 at the kernel's own exponent. That is why the Fourier
saving is 7.474546e-4, just below the kernel's 7.474547e-4 (section 2, point 4).

**The fourth result repeats the same reduction once more, for the new kernel program.** `Work/FourierE8/` is a
twin of `Work/Fourier/`:

- It has the same 11 files of OpenAI, copied by the same kind of script (`tools/fourier/mkchain_e8.py`, a
  copy of `mkchain.py` with the constants changed).
- It has the suffix `E8` where the third result has `Z`.
- It has `alphaE8` = 1 - 8762479/10^10, and the exponent 1 - 8762478/10^10 in the final statement.
- Its seam file `Work/FourierE8/Seam.lean` (251 lines) is the seam of the third result with names and numbers
  replaced. No proof step had to be changed.

Everything this section says about the copies of the third result holds for these copies too, and
[NOTICE](NOTICE), section 7, lists them. The two chains share no name, so both are in the repository side by
side.

**Others reached this statement before me, and the credit for that is theirs.**

- **danadran01** wrote the first Lean proof that improves OpenAI's Fourier statement, as far as I could
  find: [danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving). Its saving is
  3.2e-6, on OpenAI's own `DFTProgram` and `TimeBounds`, with whole-block recursion in Lean under the name
  "grouped recursion". Their development changes three of OpenAI's files, all three at the theorem named
  above, and by their record the rest of OpenAI's chain then goes through as it is. Their record reports a
  clean build, the standard axioms and `leanchecker`, and no comparator run. It was not built here.
- **shea256** wrote the first written transfer of a community network to this statement:
  [shea256/fourier-transform-below-nlogn](https://github.com/shea256/fourier-transform-below-nlogn). Its first
  commit is of 8 October 2026. eumemic writes of it: "That work has priority for the idea of the transfer".
  On 9 October 2026 its figure was 6.7e-4. It was described there as "a proposed conditional transfer,
  supported by a written argument and finite checks", and it was not formalised. On 10 October 2026 it gives
  7.547360e-4 instead. That is the figure of Chafik Boukhalfa's pull request #2 of this repository, a Lean
  proof. The agents built that pull request on a Linux machine on the same day ("Whose circuit this is").
  shea256 reports a rebuild of that proof in its own repository, which was not repeated here, and writes
  that the repository "does not claim a new exponent of our own".
- **eumemic** wrote a written transfer with batched recursion:
  [eumemic/exact-dft-bounds](https://github.com/eumemic/exact-dft-bounds). It gives every saving below
  4.856e-4, with an extra log log factor. In their words it is "a paper proof with an exact finite
  certificate, and it is not formally verified". Their README also states in writing the observation that
  the route here rests on: OpenAI's later sections use the kernel theorem "only through three things: the
  bound O(2^k (k+1)^θ), the fact that only rational constants and i are needed (their §5.3), and its
  word-size accounting".
- **The community** made the helper circuit behind the kernel program (next section). The accounting is
  their whole-residual batching (RELATED-WORK.md, section 1).

Section 9 has the commits at which these three repositories were read, and what "as far as I could find"
rests on.

**What is mine in the third result:** the kernel program at this exponent with its machine check (the second
result), the seam file, and the machine check of the whole against OpenAI's statement.

**How the figures compare.** The table has the three outside figures as they stood on 9 October 2026.

| | outside figure | my 7.474546e-4 is |
|---|---|---|
| danadran01, in Lean | 3.2e-6 | 233 times that |
| eumemic, written | every saving below 4.856e-4 | 1.54 times that |
| shea256, written | 6.7e-4 | 1.12 times that |

The two written figures rest on other networks, and they were moving within hours while this was written.
The agents read the three repositories again on 10 October 2026. Two had not changed. shea256's now gives
7.547360e-4, the figure of Chafik Boukhalfa's pull request #2 of this repository ("What is new in the fourth
revision", item 1).

## Whose circuit this is

This section is about the circuit of the second and third results. The circuit of the fourth result is another
one; its credits are at the top, under "Whose ideas the new unit uses".

The helper circuit is the part of the network that decides the size of the saving. It is the additions by
which pairs of data arrays exchange their contents, with the helper arrays (extra arrays that hold the
partial sums) that this needs; section 6 describes it. In the second result, and so in the third, it is the
community's in every part. The community is the group of people who publish their work as pull requests to
the public repository [CrocSwap/integer-mult-bounds](https://github.com/CrocSwap/integer-mult-bounds). A
number with # below is a pull request there, unless the sentence says otherwise.

- **icekylinx** made the paired-cube construction
  ([#144](https://github.com/CrocSwap/integer-mult-bounds/pull/144)). Its notice credits an664 (#128) for the
  workspace-sharing principle and eumemic (#117) for the producer that its modules restrict.
- **eumemic** made the modules, carrier links, frames and physical layer at p = 11
  ([#168](https://github.com/CrocSwap/integer-mult-bounds/pull/168), "PR168 v4").
- **icekylinx** made the local circuit inside each cube that takes a + b and a - b from the same two arrays,
  and the frame flow that goes with it ([#184](https://github.com/CrocSwap/integer-mult-bounds/pull/184)).
- **ikeboy** put that construction on #168's newer modules
  ([#191](https://github.com/CrocSwap/integer-mult-bounds/pull/191)).
- **ikeboy** made the choice of hand-over pairs with which that step runs in place and erases nothing
  ([#193](https://github.com/CrocSwap/integer-mult-bounds/pull/193)). A hand-over pair says which helper
  array that is no longer needed is handed to which new user. In their accounting this last step is the whole
  jump from 6.6307e-4 to 7.009184e-4.

**How #193 states its own credits.** "icekylinx (PR184, with GPT-6 Astra and Codex assistance) for the
method, the tools and the bit supplier. eumemic (PR168 v4, with Claude assistance) for the query modules and
the physical layer. Package by Avi Eisenberg with Claude assistance."

**Techniques of other authors** reach the circuit through these pull requests: slot reuse at birth, frame
descent, the closure-compiled carrier links of DaysSky (#162), and the fusion of the single-target outputs
after chafreaky (#163). They are credited in RELATED-WORK.md, section 1.

**How the circuit came into this repository.** The agents rebuilt the circuit as one explicit list of
additions, from the files that these pull requests publish: the module files, carrier links and frames of
#168 and the pair list of #193 ([NOTICE](NOTICE) names each file). The programs that did this are in
`tools/rebuild/`.

- The agents made them with the community's scripts open as text.
- Six of the thirteen files are adaptations of scripts by icekylinx, eumemic, DaysSky and ikeboy, in parts
  statement by statement. [NOTICE](NOTICE), section 6, says which follows what.
- The other seven were written for this repository. One of them, `rewrite.py`, is the step that turns the
  word of #193 into one explicit list of gates. (The word is the network written as a sequence of stages.)
- No outside program was run. That repository is under Apache-2.0.

**Another choice of hand-over pairs, by Chafik Boukhalfa.** Another choice of the 2,310 hand-over pairs for
the same word is by chafreaky (Chafik Boukhalfa),
[#233](https://github.com/CrocSwap/integer-mult-bounds/pull/233), in his words "PR #200's maximum-weight late
compensated pairing" ([#200](https://github.com/CrocSwap/integer-mult-bounds/pull/200)). He proposed the swap
in issue #1 of this repository. With his pairs in place of #193's, the rebuild in `tools/rebuild/` gives a
certificate that my checker accepts. `gxdry.py` prices that certificate at 7.547361e-4; the published
certificate has 7.474547e-4. That is a price computed in Python: this repository has no Lean modules for that
certificate, and its theorems do not use it (`tools/gx/ORIGIN.md`, "Another file of hand-over pairs"). His
pull request #2 to this repository goes further. It holds a certificate of his own making for the same
circuit, with the same block histogram and the same price, the Lean modules that the unchanged generators
of this repository write from it, and a Fourier chain. He reports a Lean kernel check of the Walsh-Hadamard
statement at 1 - 7547361/10^10 and of the Fourier statement at 1 - 7547360/10^10, with `tools/Compare.lean`
and a comparator run on Linux. With the unchanged generators I reproduced his 41 generated files byte for
byte, and my checker and `gxdry.py` accept his certificate at 7547361. On 10 October 2026 the agents built
his pull request on a Linux machine. All 54 Lean modules that it adds compiled. His three theorems depend
only on the three standard axioms. `tools/Compare.lean` printed `RESULT: PASS` for his Walsh-Hadamard
statement and for his Fourier statements. The agents did not run the official comparator on his files; he
reports those runs himself. On my Mac the build could not finish, because two of his modules need about
13 GB of memory each. So in his pull request 7.547361e-4 is a Lean theorem, and it is his result. Section 9
has the details of the build. The pull request is not merged: I would rather this repository make that
circuit with its own scripts, which `tools/rebuild/` now does, than carry generated files.

**What is mine:** the Lean proof of the general frame lemma for this RAM model, the generalised engine, the
extended certificate checker (section 5), the bridged five-stage layout in which their circuit is placed
(section 6), and the machine check of the whole.

**What the machine check here adds.** This is the first full machine check of that circuit that I know of, as
of 9 October 2026 (section 9 says what that rests on). The author of #193 states the scope of that pull
request's own validation in these words: "The exact lift and the contract checks establish the local maps and
the flow ledger. There is no globally renumbered scalar transcript of the new complex word and no full
Clifford/router replay." What is checked here is the circuit inside my statement. Their theorem is about
integer multiplication and has further parts that this repository does not touch (section 2, point 1).

**Why my figure for the same circuit is above theirs.** #193 states 7.009184e-4 for this circuit, and the
second result has 7.474547e-4. The layout differs: their word has three stages, mine has five. By the agents'
computation the same circuit in a three-stage word gives 7.0091e-4.

## 1. The results

### The fourth result: both statements at 8.7625e-4 (new on 2026-10-10)

The fourth result is the largest saving in this repository: 8.7625e-4, for the Walsh-Hadamard transform, for
the Fourier transform of every length and for convolution. The saving is 1 - z, where the program needs
O(n (log n)^z) operations. The second and third results have 7.4745e-4.

**What is new is the unit.** The unit is the finite network that the saving is computed from: a fixed set of
arrays (working copies of the data, each of length n) and a fixed list of steps on them. The figure is larger
for one reason only: the unit is another one, and it is much smaller.

| | fourth result | second and third results |
|---|---|---|
| bank pairs (a bank pair is two data arrays that exchange their contents) | 120 | 1,320 |
| helper arrays (extra arrays that hold partial sums) | 783 | 9,412 |
| arrays in all | 1,263 | 14,692 |
| dimension m of the label space (each array has to be transformed along m directions) | 45 | 110 |
| moves in one pass of the circuit (a move transforms one array along one direction, and is what costs) | 9,039 | 262,944 |
| blocks in one pass of the circuit (a block is a run of moves of one array) | 3,974 | 70,169 |
| saving proved for the Walsh-Hadamard transform | 8.7625e-4 | 7.4745e-4 |

Section 6 describes the new unit and has the full table.
[notes/how-the-e8-unit-was-found.md](notes/how-the-e8-unit-was-found.md) says how it was found.

**What the theorems say.** They are the statements of the third and second results with another number, and
with other names so that all of them can stand in one repository.

    theorem OAI.PowerSaving.transform_mainE8 : DFTGoalE8
    theorem OAI.PowerSaving.convolution_mainE8 : ConvGoalE8
    def decimalExponentE8 : ℝ := 1 - 8762478/(10^(10:ℕ))

    theorem OAI.PowerSaving.WHT.wht_main_block_B2Ge8x :
        ∃ solve W, WHTProgram solve W ∧ WHTTimeBoundsAt (1 - 8762479/(10:ℝ)^10) W

- **Fourier and convolution.** One fixed program computes the discrete Fourier transform of every length
  n >= 1 in O(n (log n)^z) operations with z = 1 - 8762478/10^10, and in o(n log n). A second fixed program
  does the same for convolution.
  - Proof: module `Work.FourierE8.Main`.
  - Statement: module `Work.FourierE8.UniformFourierChallenge` (348 lines, imports only Mathlib). It is
    OpenAI's challenge file with the same three changes as in the third result: a comment, the exponent, and
    a suffix on the same seven names (here `E8`).
  - `DFTGoalE8`, `ConvGoalE8` and `TimeBoundsE8` are the definitions shown below for the third result, with
    that suffix and that exponent.
- **Walsh-Hadamard.** One fixed program computes the Walsh-Hadamard transform of every length n = 2^k in
  O(n (log2 n + 1)^z) operations with z = 1 - 8762479/10^10 = 0.9991237521, and in o(n log n).
  - Proof: module `Work.GCert.Data.SolutionB2Ge8x`.
  - Statement: module `Work.GCert.Data.ChallengeB2Ge8x` (`Work/GCert/Data/ChallengeB2Ge8x.lean`, 331 lines,
    imports only Mathlib). It is the statement of the second result with the exponent replaced, a new theorem
    name, and comments that quote the new names.

**What the theorems rest on.**

- The Walsh-Hadamard theorem needed no new Lean proof. The circuit of the new unit is written down as a
  certificate: a data file that lists every addition of the circuit. The checker of the second result, a
  Lean function with proofs that what it accepts is sound, reads that file
  (`tools/certificate/gcert1-e8-r783.json.gz`). Section 3 says how the result was checked, and section 5 says
  which parts of the certificate format this circuit is the first to use.
- The Fourier and convolution theorems are the same kernel program carried through OpenAI's reduction. The
  kernel program is the core program, for the lengths 2^k. The reduction is the step from those lengths to
  every length ("Whose reduction this is", above).

**Where the number comes from.** `tools/gx/gxdry.py` prints the figure 8762479 for this unit, in whole-block
accounting at ten decimals, and the generated rate lemma proves that figure. (Whole-block accounting counts a
run of r moves of one array as one recursive call; section 2, point 3.) The Python tool evaluates the rate
inequality as true up to 8762482 and as false at 8762483. The three figures in between are neither proved nor
claimed. The Fourier statement is one unit lower, for the reason given under the third result (section 2,
point 4).

**What the theorem does not say.** The statement gives the exponent. It says nothing about the unit. That
the certificate behind it has the 120 labels described in section 6 is tested by the search programs
(`tools/e8/`). It is not tested in Lean, and not by the two checkers of `tools/gx/`: those two accept, with
the same figure, a copy of the circuit carried to another family of 120 labels. The theorem does not depend
on which family it is.

Everything said below about the cost model, about whose statements these are and about what `DFTProgram`,
`ConvProgram` and `WHTProgram` mean holds for the fourth result word for word.

### The Fourier transform of every length (third result)

One fixed program, in the RAM model of OpenAI's proof, computes the discrete Fourier transform of every length
n >= 1 in O(n (log n)^z) operations with z = 1 - 7474546/10^10, and in o(n log n). The saving 1 - z is
7.474546e-4. The logarithm is the natural one, as in OpenAI's statement. A second fixed program does the same
for convolution.

    theorem OAI.PowerSaving.transform_mainZ : DFTGoalZ
    theorem OAI.PowerSaving.convolution_mainZ : ConvGoalZ

    def DFTGoalZ : Prop := ∃ order solve W, DFTProgram order solve W ∧ TimeBoundsZ W
    def ConvGoalZ : Prop := ∃ order solve W, ConvProgram order solve W ∧ TimeBoundsZ W
    def TimeBoundsZ (W : ℕ → ℕ) : Prop :=
      let W' := fun n : ℕ => (W n : ℝ)
      W' =O[atTop] paperTime ∧ W' =O[atTop] decimalTimeZ ∧ W' =o[atTop] nlogn
    def decimalTimeZ (n : ℕ) : ℝ := (n:ℝ) * (Real.log (n:ℝ)) ^ decimalExponentZ
    def decimalExponentZ : ℝ := 1 - 7474546/(10^(10:ℕ))

Proof: module `Work.Fourier.Main`. The statement with every definition it depends on: module
`Work.Fourier.UniformFourierChallenge` (`Work/Fourier/UniformFourierChallenge.lean`, 348 lines, imports only
Mathlib). It is
OpenAI's challenge file `lean/ComparatorChallenges/UniformFourier.lean` (336 lines) with three changes, which
its first comment lists: that comment; the exponent, `1 - 1/(10^(13:ℕ))` in OpenAI's file; and the letter `Z`
at the end of seven names (`decimalExponent`, `decimalTime`, `TimeBounds`, `DFTGoal`, `ConvGoal`,
`transform_main`, `convolution_main`). The letter is forced: the proof imports OpenAI's unmodified files, in
which these names carry OpenAI's values. Every other byte of the file is OpenAI's.

- `DFTProgram order solve W`: `order` and `solve` are two programs of the RAM, `solve` in the mode without
  general products. For every n >= 1, `order` computes from n a number d with 0 < d < 1024 n^3. For every
  complex vector x of length n, the run of `solve` on (n, exp(2 pi i / d), x) is valid (no division by zero)
  and returns exactly `dft n x` (entry j is the sum over k of exp(2 pi i j k / n) x_k). The work of `order`,
  one unit for the root, and the work of `solve` are together at most W(n). Every integer the two programs
  produce, and W(n) + 10(n+2), is at most (n+2)^c for one constant c. The root of unity is an input because
  the RAM has no instruction that produces it.
- `ConvProgram order solve W`: the same for the convolution of two vectors of length n (`conv n x y`, of
  length 2n - 1), with `solve` in the mode with general products and a root of order below 1024 (2n-1)^3.
- `TimeBoundsZ W`, three bounds as n grows: W(n) = O(n (log n)^(1 - d)) with d = 7.474546e-4
  (`decimalTimeZ`; the one line whose value differs from OpenAI's, where d = 10^-13); W(n) =
  O(n (log n)^theta (log log n)^(4 - theta)), the bound of OpenAI's manuscript with its own theta, about
  1 - 2.1e-13 (`paperTime`, unchanged); and W(n) = o(n log n).

The cost model and its caveats are the same for all four results. They are stated below, under "The cost
model is OpenAI's, with its caveats".

**Whose statement this is.** OpenAI's, with one number replaced. No definition in it was written for this
repository.

**Where the exponent comes from.** The kernel program runs at saving 7.474547e-4; the theorem of the second
result rests on it. OpenAI's reduction turns it into a Fourier program whose work is
O(n (log n)^z (log log n)^2) at that z. A pure power of log n therefore needs an exponent slightly above z,
and the statement has the saving 7.474546e-4 (section 2, point 4).

### The Walsh-Hadamard transform (second and first results)

One fixed program, in the RAM model of OpenAI's proof, computes the Walsh-Hadamard transform of every length
n = 2^k in O(n (log2 n + 1)^z) operations with z = 1 - 7474547/10^10 = 0.9992525453, and in o(n log n).
The saving 1 - z is 7.474547e-4.

    theorem OAI.PowerSaving.WHT.wht_main_block_B2Gp193x :
        ∃ solve W, WHTProgram solve W ∧ WHTTimeBoundsAt (1 - 7474547/(10:ℝ)^10) W

Proof: module `Work.GCert.Data.SolutionB2Gp193x`. The statement with every definition it depends on: module `Work.GCert.Data.ChallengeB2Gp193x`
(`Work/GCert/Data/ChallengeB2Gp193x.lean`, 331 lines, imports only Mathlib). It is the statement of the first result
with the exponent replaced and nothing else: the theorem has a new name, and the comments of the file quote
the new names and the new exponent.

- `WHTProgram solve W`: `solve` is one program of the RAM, in the mode without general products. For every k
  and every complex vector x of length N = 2^k, its run on (k, i, x) is valid (no division by zero), returns
  exactly `wht k x` (Sylvester order: entry j is the sum over l of (-1)^(number of common 1-bits of j and l) x_l),
  costs at most W(k) units of work, and every integer it produces, and W(k) + 10(N+2), is at most (N+2)^c for
  one constant c. The imaginary unit i is an input because the RAM has no instruction that produces it.
- `WHTTimeBoundsAt β W`: W(k) = O(2^k (k+1)^β) and W(k) = o(2^k k) as k grows.

**The cost model is OpenAI's, with its caveats.** Numbers are exact complex numbers. One addition, one
subtraction or one multiplication by a prepared scalar costs one unit of work, whatever the size of the numbers.
Index arithmetic and array access are charged too. The coefficients are unrestricted. Only the integers
(indices, lengths) are bounded, by a polynomial in n. OpenAI describes its own result in these words: "the model
permits exact complex arithmetic and unrestricted coefficients, while integer values and indices remain
polynomially bounded in n" (their `lean/docs/130.md`). So the theorem says nothing about bit complexity, about
computations with bounded coefficients, or about numerical stability (section 2, point 6).

**Whose statement the Walsh-Hadamard one is.** Part OpenAI's, part my project's.

- OpenAI's repository states and proves the discrete Fourier transform of every length (`DFTProgram`,
  `TimeBounds`, stated saving 10^-13). Its family 130 has no Walsh-Hadamard statement.
- The RAM cost model in my statement is OpenAI's, byte for byte (from their
  `lean/ComparatorChallenges/UniformFourier.lean`).
- The about 60 lines after it, which define `wht`, `WHTProgram` and `WHTTimeBoundsAt`, are my project's,
  written on the pattern of OpenAI's `DFTProgram`. They should be read. Section 9 has the line ranges.
- The agents first proved the statement with the exponent 1 - 2/10^11 of OpenAI's tensor engine (`alpha` in
  their `TensorSaving.lean`) as a corollary of that engine (`WHTCheck/Solution.lean`). Here only the exponent
  is replaced.

**The first result.** `wht_main_block_B2Ke16x`, saving 5.399225e-4 (z = 1 - 5399225/10^10), with my project's
own helper circuit and the first engine.

- Proof: `Work.CarrierCheck.SolutionB2Ke16x`. Statement: `Work/CarrierCheck/ChallengeB2Ke16x.lean` (331 lines).
- It was published on 9 October 2026, and its files are in this repository as they were published.
- So is its companion with OpenAI's own recursion, `wht_main_rank_B2Ke16x`: the same statement with
  1 - 3155781/10^10 (`Work.CarrierCheck.SolutionB2Ke16xR`).

The two figures of the first result are two accountings of the same network.

- Per-rank: every single move is one recursive call on 1/m of the coordinates, as in OpenAI's proof.
- Whole-block: r consecutive moves of one array are one call on r/m of the coordinates. That idea is the
  community's "whole-residual batching" (RELATED-WORK.md). Its Lean proof for this RAM model is in this
  repository.

The second result exists in whole-block accounting only (section 2, point 3).

## 2. What is not claimed

0. **The fourth result has the limits of the second and third. Its figure is larger for one reason only: the
   unit.** Every point below holds for it with 8.7625e-4 in place of 7.4745e-4, except where a point says
   otherwise. In particular:
   - It is in whole-block accounting only (point 3).
   - Its Fourier saving is strictly below its kernel's: 8762478 against 8762479 (point 4).
   - It is a statement about growth (point 5). The sizes given there are those of the earlier units. They
     were not recomputed for the new unit, the one with m = 45.
   - It says nothing about integer multiplication. No bit side is offered here (point 1).
1. **The second result is not a better circuit, and it does not verify the community's theorem.** The second
   result places their circuit in my layout and checks it for my statement. Nothing here is about integer
   multiplication. Their headline figure is kappa, their saving for integer multiplication. Kappa also needs
   a second ingredient (the "bit side") and analytic and routing interfaces that their authors call
   assumptions. None of that is checked or used here. The third result uses the same circuit and has no
   circuit of its own. The fourth result has a circuit of its own, for my statement only.
2. **The outside figures are a different quantity, and they keep moving.** The titles of the pull requests to
   CrocSwap/integer-mult-bounds give kappa, the saving for integer multiplication. Kappa is roughly the
   smaller of two numbers: the "complex side" saving, which is the quantity of my theorem, and the bit side.
   For #193 the complex side is 7.009184e-4 and kappa is 6.647872e-4.
   - **On 9 October 2026** the pull requests were read twice. Both times the largest complex-side saving
     stated as a result was still 7.009184e-4, the circuit of #193, which several later pull requests keep.
     The largest kappa in a title was 6.831905e-4 the first time (Dugongue) and 6.839217e-4 the second
     (eumemic). One pull request prices further steps, up to kappa 1.226488e-3, and its title calls them
     "target, not built".
   - **On 10 October 2026** the 100 newest pull requests were read, and the list was read once more later
     that evening. The largest complex-side saving with a reported Lean check was 7795/10^7
     (DreamingOfClouds, [#327](https://github.com/CrocSwap/integer-mult-bounds/pull/327)), for a word at
     h = 20 in the five-stage layout of this repository. Its author reports a Lean kernel check of it with
     this repository's generators. It was not built here. A closed pull request there, by maxime-fleury,
     prices 8.3465e-4 for the complex side and itself calls that "a conditional priced target, not a
     witness". The largest kappa in a title was 7.77596e-4 (eumemic).
   - Section 9 has the full record of these readings: the hours, the pull-request numbers and what was
     read.
   - What kind of figure each of these is. Most are prices: their authors' Python scripts compute them, they
     are not peer reviewed, and they have no Lean proof. That holds for every kappa figure above, for the
     7.009184e-4 of #193 and for the 8.3465e-4 of the closed pull request. Their authors call them
     conditional. The one exception in this list is the 7795/10^7 of #327: its author reports a Lean kernel
     check of it, and that check was not built here.
   - [#192](https://github.com/CrocSwap/integer-mult-bounds/pull/192) (DaysSky) states a ceiling of 7.010e-4
     "for every frame layout of #168's word". #193 says of it: "The PR192 frame ceiling covers only PR168's
     fixed word and pairs, so it does not apply to this word." My figure is above it for one more reason, the
     five-stage layout.
3. **Whole-block accounting only.** There are two ways to count the cost of a network. Per-rank accounting
   counts every single move as one recursive call, as in OpenAI's proof. Whole-block accounting counts a run
   of r moves of one array as one call. The generalised engine has a whole-block theorem and no per-rank
   theorem. So the second result has no companion with OpenAI's own recursion. In per-rank accounting the
   result of this repository is still 3.155781e-4, from the first network. The third result rests on the same
   whole-block kernel program, so it has no such companion either: in OpenAI's own recursion the Fourier
   statement stands where OpenAI proved it.
4. **The Fourier saving is strictly below the kernel's.** The final statement of the third result carries
   no extra factor: it is O(n (log n)^(1 - d)) with d = 7.474546e-4. Behind it, OpenAI's reduction costs a
   factor (log log n)^2 on top of the kernel program. At the kernel's own exponent, z = 1 - 7.474547e-4, the
   chain therefore gives O(n (log n)^z (log log n)^2). A pure power of log n needs an exponent a little
   above z. The same argument would give every saving below 7.474547e-4. The theorem here states
   7.474546e-4, and it does not state 7.474547e-4 itself.
   - Outside figures for the same statement, as the agents found them on 10 October 2026:
     - In Lean: 7.547360e-4, in pull request #2 of this repository, by Chafik Boukhalfa. It is the circuit
       of his pull request 233 in the community's repository, in the layout of this repository.
       [shea256/fourier-transform-below-nlogn](https://github.com/shea256/fourier-transform-below-nlogn) now
       gives the same figure, with its own rebuild of that proof.
     - In Lean: 3.2e-6
       ([danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving)).
     - In a written argument that is not formalised: every saving below 4.856e-4 with an extra log log
       factor ([eumemic/exact-dft-bounds](https://github.com/eumemic/exact-dft-bounds)).
     - The agents built the proof of pull request #2 on a Linux machine on 10 October 2026, and every
       module of it compiled ("Whose circuit this is"). They did not build danadran01's proof or shea256's
       rebuild. Each is reported by its author. The last two figures rest on other networks.
     - On 9 October 2026 shea256's repository had 6.7e-4 in place of today's figure. That was a conditional
       written argument, not formalised.
   - The Walsh-Hadamard results are for the lengths 2^k only. The first of them, with my project's own
     circuit, has not been carried over to the Fourier statement.
   - The statement is OpenAI's `DFTProgram` and `ConvProgram`: transforms over the complex numbers, with a
     root of unity supplied to the program. Nothing is claimed for other transforms or other models.
5. **It is a statement about growth, not a usable algorithm.** The items below give the sizes involved. A
   number marked (c) was computed from a formula, not in Lean. The figures are those of the kernel program of
   the second and third results. The first result's are in square brackets.
   - The proof works with a table of 2^a arrays indexed by all orthogonal matrices of a 110-dimensional space
     over F_2 [80-dimensional]. The table is never written down. a = 6049 (c) [3213], and 2^a has
     1821 digits (c) [968].
   - Below log2 n = m (a + 1) = 665,500 (c) [257,120] the program is the ordinary n log n algorithm.
     Nothing changes for any input whose length has fewer than 200,336 digits (c) [77,401].
   - The constant is huge. As one of the agents read in the Lean proofs, the program fills all 2^a arrays with
     the input, which puts a factor 2^a into the constant. With it the bound is below n log2 n only when
     log2 log2 n exceeds a/(1 - z), about 8e6 (c) [6e6].
   - A second explicit factor is 1 + 1/slack of the rate inequality. The slack is 6e-10 here
     [2e-10 to 4e-10], by the auditing agent's arithmetic; the rational bounds of the Lean proof leave 2e-12.
     Machine constants were never computed, here or by OpenAI.
   - With every constant set to 1, a gain of 1% over the ordinary algorithm needs log2 n near 2^39
     (c, heuristic) [2^45].
   - For the third result these are figures of the kernel program, not of the Fourier program. The
     Fourier program calls the kernel program on arrays whose lengths it chooses itself: by the agents'
     reading of OpenAI's files, about (log log n)^2 sweeps on arrays of total length at most 8n. The
     lengths n at which the saving starts, and the constants of the reduction, were not computed, here
     or by OpenAI.

   In Lean: `tableExp n s = Nat.clog 2 n + s`, `threshold u a = u * (a + 1)`, m = 110, s = 40, 14,692
   arrays per unit [m = 80, s = 40, 9362], one unit per orthogonal matrix. Not in Lean: the order of that group,
   which gives a and so every (c).
6. **It is not a statement about bit complexity or about numerical computation.** One unit of work is one exact
   operation on complex numbers of any size, and the coefficients are unrestricted (section 1). OpenAI writes of
   its circuit result that it makes "no all-length, bounded-coefficient, conditioning, or bit-complexity claim".
   The last three limits hold here as well. The classical lower bound of order n log n for linear computations
   with bounded constants (Morgenstern, 1973) is not contradicted: this model does not bound the constants.
   All of this holds for the third result too. Its root of unity is an exact input.

What is real is the exponent: a theorem about growth for all n in this model, machine-checked.

## 3. How it was checked, and the limits

The AI agents ran every check. The checks of the first three results were made on one machine, a Mac, on
9 October 2026. One more was added on 10 October 2026: a build of the published third revision from nothing
on a rented Linux machine (it is reported under "Fourth result", below). The checks of the fourth result were
made on that Mac and on that Linux machine, on 10 October 2026. The limits are at the end of this section.
Please weigh them.

Three checking tools are named throughout:

- **Lean's kernel** is the part of Lean that accepts or refuses a proof.
- **The comparator** ([leanprover/comparator](https://github.com/leanprover/comparator)) is the tool that
  OpenAI's repository uses for its own results. It checks that the proof proves exactly the given statement,
  replays the proof in Lean's kernel, and admits three standard axioms only ("Second result", below, has the
  details). It is meant to run inside a sandbox, a confinement of the build; the limits say why no run so far
  had the real sandbox.
- **`tools/Compare.lean`** is a second comparison script.

The clock times and durations of the runs of the first three results are in section 9.

**Fourth result.** [VERIFY.md](VERIFY.md), section 10, has every command, the expected lines and the measured
times and memory.

- **Build.** The new unit has 24 Lean modules: 14 with the certificate data and its kernel evaluations, under
  `Work/GCert/Data/Gen/`, and 10 above them. The two unchanged generators wrote them from the certificate.
  They were compiled from source, on the compiled modules of the earlier results. Then came the 15 modules of
  `Work/FourierE8`. On the Mac: all 39 builds ended with exit code 0, one module per `lake build`: 183 s for the 24
  modules and 168 s for the 15, with 6.15 GB as the largest resident size of one Lean process. The same 39
  modules were built once more on the Mac from the Lean files of this revision alone, in a copy of the
  complete build of the published tree: 146 s for the 24 and 47 s for the one Fourier command of VERIFY.md
  10.1, exit code 0 throughout. The three theorems depend on the axioms `propext`,
  `Classical.choice`, `Quot.sound` and on no other: each of the three lines that Lean printed on the Mac
  ends with `depends on axioms: [propext, Classical.choice, Quot.sound]`.
- **`tools/Compare.lean`**, on the Mac: `RESULT: PASS` for `wht_main_block_B2Ge8x` (107 s; largest resident
  size 6.61 GB) and `RESULT: PASS` for the pair `transform_mainE8` / `convolution_mainE8` (103 s; 7.32 GB).
  The process's own memory (footprint, sampled every four seconds) peaked at about 9.8 GB in both runs.
- **Comparator**, with the configurations `comparator/B2Ge8x.json` and `comparator/UniformFourierE8.json`, on
  the Mac, with the stand-in for its sandbox: `Lean default kernel accepts the solution` and
  `Your solution is okay!` for both, exit code 0: 85 s and 6.05 GB for the first, 89 s and 6.09 GB for the
  second. Every module was replayed from its compiled file; none was compiled inside the run.
- **Linux.** The same 39 modules were compiled from source on a rented Linux machine (x86-64, Ubuntu
  24.04, 51 GiB of memory), in a copy of that machine's build of the published third revision (next point).
  `tools/Compare.lean` and the comparator were run there too, the comparator with a stand-in for its
  sandbox: all 39 builds ended with exit code 0 (1185 s in all; largest process 6.69 GB); the three axiom
  lines are the same as on the Mac; `tools/Compare.lean` printed `RESULT: PASS` for both commands (99 s and
  150 s; 15.7 and 16.0 GB); the comparator printed `Your solution is okay!` for both configurations (406 s
  and 432 s). The stand-in there is built on Linux namespaces, and the comparator replayed modules that had
  been compiled before the run. The machine was shared with other jobs, so its times are upper bounds.
- **The third revision, built from nothing on Linux.** On 10 October 2026 the whole published third revision
  was also built from nothing on that machine. It was cloned from GitHub, and all 342 Lean modules of the
  repository were compiled from source with the commands of VERIFY.md (94 minutes; largest process 10.5 GB).
  Mathlib was not compiled from source: its compiled files came from Mathlib's cache server.
  `tools/Compare.lean` passed there for all five theorems of the first three results. That is the build
  from nothing that the limits below, written on 9 October 2026, say had not been made. The agents then ran
  the official comparator on that machine for the first three results, each time with a stand-in for its
  sandbox (the same one, built on namespaces), in a tree whose modules had been compiled before. It accepted
  all three, each with `Your solution is okay!` and exit code 0:
  - first result, `comparator/B2Ke16x.json` and `comparator/B2Ke16xR.json`: 37 and 25 minutes, 6.3 and
    6.4 GB;
  - second result, `comparator/B2Gp193x.json`: 124 minutes, 11.3 GB;
  - third result, `comparator/UniformFourier.json`: 108 minutes, 11.4 GB.

  The runs shared the machine, so the times are upper bounds. Two negative controls, one on the statement of
  the second result and one on the Fourier statement of the third, were refused with exit code 1. One run
  was still going when this text was written: the comparator for the third result in a tree where nothing
  had been compiled before. It is the third attempt in that tree, and each attempt continued the build of
  the one before. It has no verdict here.
- **No real sandbox on that Linux machine.** The comparator's sandbox needs Landlock, a feature of the Linux
  kernel. The Linux kernel of that machine has no Landlock, so the comparator's real sandbox could not run
  there either (limits, below).
- **The generated files.** `python3 tools/gx/regen_check_e8.py` and `python3 tools/fourier/regen_check_e8.py`
  run the generators again and compare the result with the files of this repository. Both end with `RESULT:
  REPRODUCED`: 25 files for the unit (the 24 Lean modules and the comparator configuration) and 14 for
  `Work/FourierE8`, byte for byte.
- **The certificate, in Python.** Both published checkers accept it:
  - `refcheck.py` prints `ACCEPTED by gx.check1: h=9 v=120 R=783 N=9039`;
  - `gxdry.py` prints `MIRROR ACCEPTS` and `whole-block 8762479`.

  A stand-alone replay written by another agent, which reads only the certificate, gives the same numbers.
  Both checkers refuse seven deliberately damaged copies: a wrong coefficient in an in-place pair, a removed
  compensating read of a re-used helper, two helpers folded into one, a total declared one dimension lower,
  two labels exchanged, a source added with 1 in place of 1/2, and three blocks booked as one cheaper block.
- **Negative controls in Lean were run on the two earlier designs of the same day and then on this
  certificate.**
  A negative control is a check that has to fail: a damaged input, or a statement with a larger saving, that
  the tools must refuse.
  - Two earlier units of the same kind were built in Lean on 10 October 2026 during the work, at 7.5590e-4
    (7558959) and at 8.3202e-4 (8320202; its Fourier twin at 8320201).
  - Both were Lean-checked during the work: on the Mac (kernel build, `tools/Compare.lean`, comparator) and
    on the Linux machine (kernel build, `tools/Compare.lean`). Their Lean files are not included, since the
    certificate of this revision supersedes them.
  - On the first, on the Mac, an auditing agent gave Lean six damaged inputs and two raised figures. Lean
    refused five of the six and both raised figures, and the comparator refused both challenges with a
    larger saving. The sixth is the record of the next point. `tools/Compare.lean` could not be run to its
    end in that audit, because of memory.
  - On the second, on Linux, another agent made 13 builds that had to fail and 8 that had to pass, each
    outcome written down before the run. All 21 came out as written, and `tools/Compare.lean` failed both
    challenges with a larger saving.

  On the certificate of this revision an agent ran negative controls in Lean on the Mac on 10 October 2026,
  in a separate copy of the build tree. A second agent then audited that record. It compared the damaged
  files with the true ones and read the logs. It ran no Lean itself. This is what the audit supports:

  - **Twelve wrong Lean modules were refused**, and none of them left a compiled file. The unchanged text
    under other names built to the same theorem, on the three standard axioms.
  - **Six of the twelve had one wrong coefficient each.** Three were in half pairs (two additions in a row
    between two helpers, one of them with the factor 1/2). One was in an addition of a source into a helper
    with 1/2. One was in an addition of a helper into a helper at a frame of dimension 8 after the scatter
    (the step that hands the totals to the targets). One was in the scatter itself. Each differs from the
    accepted text in one token, and Lean's check of the coefficients refused each.
  - **Two had a wrong label.** In one, a helper is sent to a line (a frame of dimension 1) that does not lie
    in its next frame. In the other, a helper that climbs from a line to the full frame in one block has a
    wrong rank. Lean's check of the labels refused both, and it built a legal twin of the first.
  - **Three claimed a larger saving.** The rate lemma did not build at 8.762483e-4 or at 8.8e-4. A solution
    file that states 8.762483e-4 and cites the real theorem failed with a type mismatch.
  - **The twelfth** tried to profit from the gap of the next point, and Lean refused it.
  - `tools/Compare.lean` printed `RESULT: FAIL` for a challenge at 8.762483e-4 against the real solution.
  - The published Python checkers `refcheck.py` and `gxdry.py` refused every damaged certificate.

  Limits of these controls:

  - The published generator writes no Lean text for a damaged certificate. So the damaged Lean text came
    from an unpublished driver, or from an edit of generated text.
  - They touch 3 of the 21 half pairs, 1 of the 4 additions of a source into a helper with 1/2, 1 of the 5
    additions of a helper into a helper at dimension 8 after the scatter, and 1 of the 2 climbs from a line
    to the full frame. None is aimed at the table depth 10, the digit width 7 or the largest digit 36,
    three sizes that the check of the coefficients works with for this certificate.
  - A refusal by Lean says only that a check is false. It does not say which test inside the check failed.
  - There is no control on the Fourier modules and none on Linux, and the official comparator was not run
    on a wrong pair.
  - That each expected outcome was written down before its run rests on the time stamps in the agent's own
    file.
  - The audit is a reading of files and logs. No Lean run and no run of the Python checkers was repeated.
- **One damaged record that Lean accepts.** In those controls one wrong input went through: a wrong frame
  number in the certificate's list of totals. Lean does not use that number: the frame of a total is taken
  from the replayed state. For this certificate that was seen in a run for the first entry of the list. For
  the other seven entries it is a reading of the Lean functions that receive the list, not a run. With that
  one number wrong and nothing else changed, Lean built the same theorem, and the Python checkers
  `refcheck.py` and `gxdry.py` refuse the file. A version that tries to profit from the wrong frame, with
  all 8 totals priced one dimension lower, is the twelfth module above: Lean refused it. The entries of the
  published certificate are correct. So this is a field of the JSON file that only the Python checkers
  check, and about which "Lean accepted it" says nothing.

**Third result.**

- **Comparator.** The comparator (described under the second result, below) was run with the configuration
  `comparator/UniformFourier.json`. Its challenge is `Work/Fourier/UniformFourierChallenge.lean`, OpenAI's
  challenge file with the exponent replaced (section 1). It checks both theorems, `transform_mainZ` and
  `convolution_mainZ`. Its verdict "Lean default kernel accepts the solution" / "Your solution is okay!" was
  obtained twice, in the project's working tree, on Lean files that are byte for byte those of this
  repository: once by the agent that built the proof, and once by an auditing agent with its own
  configuration.
- **Audit by a separate agent** (another Claude session with its own scripts; not a human).
  - Besides its own comparator run it ran the second comparison script (`tools/Compare.lean`): pass, on the
    three standard axioms.
  - Both tools reject the same proof against a statement whose saving is one unit larger.
  - It compared the eleven repeated files with OpenAI's originals token by token. Apart from the renames, the
    differences are the seam, one constant, and one name written out in full in five places, which keeps
    OpenAI's meaning.
  - It walked both proofs, that is, followed everything they depend on. They reach every kernel check of the
    certificate and no `sorryAx` (the axiom that a `sorry`, an unproved step, leaves behind).
  - It did not read the repeated proofs line by line and did not rebuild from source.
- **What the kernel replays.** The Fourier theorem rests on the certificate of the second result. The
  comparator replays the whole proof in the kernel, the segmented evaluations of that certificate included.
- **Build.** The modules of `Work/Fourier` were compiled from source in the project's working tree, on the
  compiled modules of the second result (under two minutes; VERIFY.md, section 3). What is said below about the
  build of the second result holds here too: on 9 October 2026 no build from nothing had been made. One was
  made on 10 October 2026, on Linux ("Fourth result", above). In a copy of the
  repository the 15 new modules were compiled from source on the compiled modules of the second revision. The
  comparator and `tools/Compare.lean` were then run in that copy, and both passed.
- **The repeated files.** `tools/fourier/mkchain.py` (242 lines of Python) makes the 11 copies, `Goal.lean`, the
  challenge and the comparator configuration from OpenAI's unmodified files. `python3
  tools/fourier/regen_check.py` runs it again and compares the result with the files of this repository: all 14
  were reproduced byte for byte (VERIFY.md, section 6). So every difference between a copy and its OpenAI
  original is one that the script makes, and the script can be read. A second comparison, by another agent's own
  script, of each copy with its original line by line made the table in ORIGIN.md. Beyond the renamed names, the
  import lines and the added comments it found the two edits named in "Whose reduction this is", the exponent
  line of the challenge, and no other change to the code.
- **Audits by separate agents** (other Claude sessions; not humans). I had an auditing agent compare the new
  statements with OpenAI's as kernel terms, not as text. In the seam file, `hillsZ_program` has the type of
  OpenAI's `hills_program` with `hills` replaced by `hillsZ`; `hillsZ` is OpenAI's `hills` with `alpha` replaced
  by `alphaZ`; `alphaZ` is OpenAI's `alpha` with 2/10^11 replaced by 7474547/10^10; and the six side facts have
  OpenAI's statements. A walk of the proof term of `hillsZ_program` reached 38,544 constants: all 106 names of
  the certificate of the second result and of its soundness chain that the audit of the second result had listed
  (every kernel check of the certificate among them), no other certificate, none of OpenAI's `hills_program`,
  `hills` or `alpha`, no `sorryAx`, and the three permitted axioms only. The agent compared statements and
  walked proof terms; it did not read the proofs.

**Second result.**

- **Comparator.** The [comparator](https://github.com/leanprover/comparator), which OpenAI's repository uses
  for its own results, was run with the configuration `comparator/B2Gp193x.json`. It checks that the solution module proves
  exactly the challenge statement with identical definitions, replays the proof in the Lean kernel, and admits
  only the axioms `propext`, `Classical.choice`, `Quot.sound`, so a `sorry` or a `native_decide` is rejected.
  Its verdict "Lean default kernel accepts the solution" / "Your solution is okay!" was obtained three times:
  - twice in the project's working tree, on Lean files that are byte for byte those of this repository: once
    by the agent that built the proof, and once by an auditing agent with its own copy of the configuration;
  - once in the build copy of the repository (next item).
- **Build in a copy of the repository.** A copy with the Lean files, `lakefile.lean`, `lean-toolchain`,
  `lake-manifest.json` and `comparator/` of this revision was built on the compiled files of the first
  publication's rebuild from scratch (Mathlib from its cache, the 194 published modules compiled from nothing).
  The 102 new modules that do not load the new certificate were compiled from source in the copy. For the 31
  modules that load it, the compiled files of the project's working build were cloned: Lake accepted the 25 data
  and check modules by their traces and compiled the 6 modules above them from source. `lake build --no-build`
  of all eight roots then reported every target up to date (9250 jobs), with the three permitted axioms
  for the theorem and "declaration uses `sorry`" for the three challenge modules only. So the kernel evaluations
  of the certificate in those 25 modules were made by the compiler in the working tree, not in the copy, and the
  second result has not yet had a build from nothing. The comparator was then run in the copy and passed, with
  the same two verdict lines: it replays the whole proof in the kernel, those evaluations
  included. `tools/Compare.lean` then said `RESULT: PASS` there as well.
  [VERIFY.md](VERIFY.md) has every command, time and memory figure, and its own list of limits.
- **Certificate.** The certificate is literal data in `Work/GCert/Data/Gen/`: the 43,036 gates of one
  invocation, each a group of single additions at one frame, and the table of its 18,248 frames. It is too large
  for one evaluation, so the Lean kernel checks it in segments (each `by decide +kernel`, axiom `propext` only):
  13 evaluations for the label half (4 for the frame table, 5 for the replay of the gates and 1 for its final
  segment, 3 for the end conditions and the frames of the copies), 3 for the scalar half (2 for the replay, 660
  sources each, and 1 for the outputs), and 63 block counts.
  Lean theorems, written by the agents and not generated from the certificate, join the segments and say that
  every certificate accepted by them gives the network at the counted price. Five files of `Work/GCert/Chain/`,
  which carry the bridged network over to the generalised engine, were made by a script from the corresponding
  files of the first result; ORIGIN.md names them.
- **Audits by separate agents** (other Claude sessions with their own scripts; not humans).
  I had one auditing agent read the statements of the new theorems before the run (the statements, not the
  proofs): it found every hypothesis of the end theorem discharged inside the proof, by a kernel evaluation on
  the certificate, by the rate inequality or by a size fact. I had a second one re-run the comparator with its
  own copy of the configuration and the second comparison script (`tools/Compare.lean`); both passed, and both
  reject the same proof against a statement whose saving is one unit larger. It walked the proof term: 38,678
  constants, among them every kernel check of this certificate, and no `sorryAx`, no compiler axiom and no
  constant of the first certificate. It scanned the 124 new modules that the proof imports for `sorry`, `axiom`,
  `native_decide`, `unsafe`, macros and similar: none, apart from one file-local notation in two proof files;
  the statement file contains one `sorry`, on purpose. It recomputed the rate arithmetic with independent
  integer code: 7474547 holds; 7474548 and 7474549 would also hold but are neither proved nor claimed; 7474550
  fails (also a Lean lemma). The packaging agent ran the generators again on the certificate and got all 36
  generated files of this repository byte-identical. Not examined by the auditing agents: the proof texts, the
  Python generators, the conversion from the community's files, and whether the statement is vacuous (it is the
  text of the earlier challenges; see the limits).

**First result** (the record of the first publication, of 9 October 2026; the clock times of its runs are now
in section 9, and nothing else in it has changed).

- **Comparator**, with the configurations `comparator/B2Ke16x.json` and `comparator/B2Ke16xR.json`. Its verdict
  "Lean default kernel accepts the solution" / "Your solution is okay!" was obtained
  - by the agent that built the proof: for the whole-block theorem and for the per-rank companion;
  - by an auditing agent with its own configuration: for the whole-block theorem;
  - in a rebuild from scratch: for the whole-block theorem and for the per-rank companion.
- **Rebuild from scratch.** A copy of exactly the files of the first publication, with no build directory, was
  built from nothing: the compiled Mathlib files were downloaded from Mathlib's cache and the 194 modules were
  compiled (11 minutes). Then `tools/Compare.lean` and the comparator were run in that copy for both theorems.
  All four runs passed.
- **Certificate.** The certificate is 3.9 MB of literal data in `Work/CarrierCheck/Gen/Cr2h16.lean`: the
  addition circuit of one invocation (section 6). Three Boolean checks of it and 43 block counts are evaluated
  by the Lean kernel (`by decide +kernel`, axiom `propext` only). Lean theorems, written by the agents and not
  generated, say that every certificate accepted by the three checks gives the network.
- **Audits by separate agents.** For the whole-block theorem I had an auditing agent re-run the comparator with
  its own configuration and a second comparison script (`tools/Compare.lean`); both passed, and both reject the
  same proof against a statement whose saving is one unit larger. It walked the proof term: 36,438 constants,
  resting on the kernel checks of this certificate and on no `sorryAx` or compiler axiom. It scanned the modules
  written here that the two proofs import (102 for the whole-block theorem, and the per-rank solution module)
  for `sorry`, `axiom`, `native_decide`, `unsafe`, macros and similar (none); the two statement files contain
  one `sorry` each, on purpose. It ran the generators again and got all 21 files that they write,
  byte-identical (16 of them are in this repository). It recomputed the rate arithmetic with independent
  integer code: 5399225 holds, 5399226 would also hold but is neither proved nor claimed, and 5399227 fails
  (also a Lean lemma). The 180 older files of the proof, with the checker and its soundness proofs, belong to
  proofs examined by two earlier audits of the same kind.

**Limits. Please weigh them.**
- **No line-by-line human review yet.** The new proofs are checked by the Lean kernel but have not yet had a
  line-by-line human review. The auditing agents checked statements, not proof texts. So the claim rests on
  the kernel and on the statement being the right one. I would be glad to have both read.
- **New in the fourth revision: one day, and read by AI agents only.** The fourth result was found, built
  and checked on one day, 10 October 2026. The certificate, the search programs and the notes have been read
  by AI agents only. The theorem does not depend on the search programs or on the notes: the kernel checks
  the certificate as it is.
- **New in the fourth revision: no run with the comparator's real sandbox yet.** No run with the comparator's
  real sandbox exists yet, for any result of this repository.
  - The real sandbox is the program `landrun`. It needs Landlock, a feature of the Linux kernel.
  - On macOS the comparator ran with a stand-in for `landrun`.
  - The Linux machine has a kernel without Landlock, on which `landrun` enforces nothing. So a run there is a
    run with a stand-in or with no sandbox.
  - The sandbox protects the checker against a solution file that attacks the build. It is not part of the
    logical check.
  - A run on a Linux machine with Landlock is the re-run I would welcome most.
- **New in the fourth revision: no new Lean proof in the Walsh-Hadamard chain.** The fourth result rests on
  the generalised engine, the checker and the segmented kernel check of the second result, and every limit
  stated here for those holds for it. Its circuit uses parts of the certificate format that the certificate
  of the second result never used (section 5). That the checker's Lean functions cover those parts was first
  a reading of the agents. It is now a matter of the kernel having evaluated them on this certificate.
- **New in the fourth revision: the Fourier chain is a second set of copies.** The Fourier chain of the
  fourth result is a second set of copies of OpenAI's 11 files, made by a copy of the script of the third
  result with other constants. Its seam file is the seam of the third result with names and numbers replaced.
  What is said below about the copies of the third result holds for these too.
- **New in the fourth revision: the negative controls.** The negative controls in Lean on the certificate of
  this revision are one agent's run on the Mac. A second agent audited its record by reading the files and
  the logs, and ran no Lean itself. The controls try one to three instances of each new kind of step, not
  all of them. There is none on the Fourier modules, none on Linux and none with the official comparator.
  The other sets were run on two earlier units of the same day (the list above). And one field of the
  certificate is not read by Lean ("One damaged record that Lean accepts", above).
- **New in the fourth revision: the earlier units of that day.** The Lean files of the earlier units of
  10 October 2026 are not in this repository. Where the notes give their figures, the figures are prices
  computed by the Python tools. Two of them (7558959 and 8320202) were also Lean-checked during the work, as
  said above.
- **New in the third revision: no independent check of the kernel program.** The Fourier theorem adds no
  independent check of the kernel program. It rests on the certificate, the generalised engine and the
  checker of the second result, and every limit stated here for the second result holds for the third.
- **New in the third revision: the repeated files.** The 11 repeated files are OpenAI's proofs with every
  declaration renamed by a script. The kernel checks the result as it is. That the copies differ from
  OpenAI's files only as their first comments and NOTICE say rests on the file comparison named above, not on
  Lean.
- **New in the third revision: the statement.** The statement of the third result is OpenAI's challenge file
  with three changes (section 1). `diff` shows them in a few lines (VERIFY.md, section 1). The one that
  carries the claim is the exponent.
- **New in the third revision: the runs.** The third result has had three comparator runs, two in the
  project's working tree and one in a copy of the repository. `tools/Compare.lean` passed in both places. The
  negative control (the checkers must reject this proof against a statement whose saving is one unit larger)
  was run in the working tree. On 9 October 2026 a build of this revision from nothing had not been made.
  One was made on 10 October 2026, on Linux ("Fourth result", above).
- The comparator ran on macOS with a stand-in for its Linux sandbox `landrun` (for the Linux machine of
  10 October 2026 see the limit "no run with the comparator's real sandbox yet", above). The second kernel
  (`nanoda`) was off, as in OpenAI's configuration of its own Fourier challenge. `leanchecker` was not run on
  these modules.
- In every comparator run the modules of the proof had been compiled beforehand, outside the sandbox, so the
  comparator replayed existing build products. Mathlib was not rebuilt from source, and the Lean toolchain and
  the comparator programs were the ones already installed. See VERIFY.md, section 8.
- New in the second revision: on 2026-10-09 the second result had not yet had the rebuild from nothing that
  the first result had.
  The copy of the repository in which the comparator passed took the compiled files of its 25 certificate
  modules from the project's working tree ("Build in a copy of the repository", above), and the other two
  comparator passes were in that working tree. The build from nothing was made on 2026-10-10, on Linux
  ("Fourth result", above).
- New in the second revision: the certificate of the second result is checked by the kernel in segments. The theorems
  that join the segments are Lean proofs and are replayed by the comparator like everything else. The frame
  lemma, the generalised engine, the checker and its segmentation were all written on 2026-10-09; they are the
  larger part of what has not yet been read by a person.
- New in the second revision: the circuit of the second result is the outside authors' design, and it was
  rebuilt from their published data by Python programs that the agents made, in part by adapting the outside
  authors' own scripts ([NOTICE](NOTICE), section 6). That the rebuilt list of additions is the circuit #193
  describes
  rests on that Python conversion and on equal counts (9,412 helper arrays, the same histogram of block
  ranks), not on Lean. The theorem does not depend on this: the kernel checks the certificate as it is.
  The programs that rebuilt the circuit from the community's files are in `tools/rebuild/`. I added them
  after issue #1, whose author could not run the rebuild without them. With the community's files fetched
  at the two commits, they give the published certificate again, byte for byte once it is unpacked.
  `tools/gx/ORIGIN.md` says how to run them, and which two checking programs are still not here. The last
  step, the conversion to the certificate format, is `tools/gx/gxconv.py`.
- New in the second revision: the second result exists in whole-block accounting only (section 2, point 3), and the
  Lean checker covers the certificate format without its extension rule (unused by this certificate) and with
  every scratch copy at a frame of dimension at least 1.
- For the per-rank companion of the first result the comparator and `tools/Compare.lean` passed (the two runs
  above), but no negative control and no walk of the proof term were run. Its files were covered by the text
  checks and the arithmetic.
- A check that the statement is not vacuous was run for an earlier package (same text, other exponent), not
  for the published ones. It showed that `wht` at lengths 2 and 4 is the Sylvester matrix and that
  W(k) = 2^k k fails.
- The Python programs that searched for the first certificate, that rebuilt the second and that searched for
  the certificate of the fourth result are not part of the
  trusted base. The search programs were not audited. The kernel checks the certificates, not the programs.

**I welcome re-runs**, most of all on a Linux machine with Landlock, so that `landrun` really confines the
build, and with `nanoda` switched on. See VERIFY.md.

## 4. How it was made

I made the first three results on 8 and 9 October 2026, in about a day, and the fourth on 10 October, by
directing a team of AI agents (Claude). I began by
having them verify OpenAI's proof independently, and then kept pushing on one question: how much larger can
the saving be made while every step stays machine-checked? I set the goals, chose which ideas to pursue,
and decided at each stage what to do next. The agents wrote the Lean proofs, designed the network, found
the certificate by computer search, and audited one another's work. Several of the design ideas were found
and published independently by other people during the same hours; RELATED-WORK.md gives the public record
and the credit.

The second result came in the hours after the first was published. The first text named the next thing to
try: a Lean proof of the community's general frame lemma in this framework. I had the agents attempt it, and
it went through the same day, together with an engine and a checker that use it. From then on the best
circuit the community had published could be checked as it stands, so I chose to check theirs. The agents
rebuilt it from the published data, wrote the Lean proofs and ran the checks.

The third result came later the same day. The note on open directions had named it as a lead: carry the exponent
over
to the statement OpenAI headlines. I had the agents scope it before anything was built. They found that
OpenAI's proof uses the network through a single theorem and that the generalised engine already proves that
theorem's sentence at my exponent, and they recommended the route that leaves OpenAI's files unmodified and
repeats OpenAI's reduction in this repository. I took that route and asked for speed. The agents wrote the
seam file, repeated the 11 files by script, and ran the checks.

The fourth result came on 10 October 2026. With the checker of the second result a better circuit is a data
file, so I had the agents look for a better unit instead of a better proof.

A first round found that a family of 120 labels of width 9 can serve as a unit of this mechanism with 8
totals. That was in a wasteful form, with one helper for every unwanted term: 6,728 helpers, a price of
1.6555e-4. Three rounds of search on that family followed, all on the same day.

| round | what it did | helpers | figure |
|---|---|---|---|
| 1 | tried several architectures; the one that shares partial sums in a tree, chosen by a greedy rule under a group of 64 reorderings of the label positions, reached these figures | 1,028 | 7.5590e-4, just above the published 7.4745e-4 |
| 2 | added four devices (sources read directly, the re-use of finished helpers, totals built on used helpers, a re-scheduler) and a search over the greedy choices | 853 | 8.3202e-4 |
| 3 | replaced the greedy rule by an integer programme over a pool of 1,470 sums, with two weights chosen by the figure after the device passes | 783 | 8.7625e-4 |

The designs of rounds 1 and 2 were built in Lean as they came, and I locked the design of round 3 as the
certificate of this revision. The figures above, other than the last one, 8.7625e-4, are prices computed by
the Python tools; the notes say for each whether it was also Lean-checked.

Several routes failed, among them the transplant of the published architecture (5.0732e-4, also a price
computed by the Python tools) and a device-aware greedy rule. [notes/what-did-not-work.md](notes/what-did-not-work.md) tells them. I asked for
the search programs and that account to be published with the result, so that people and AI agents can see
how it was reached and go on from it.

The fourth revision also answers issue #1 of this repository, whose author could not run the rebuild of
the community's circuit because its scripts were not here. I had the agents tidy those scripts for
`tools/rebuild/` and compare them statement by statement with the community's own. The comparison showed
that six of the thirteen files are adaptations of the community's scripts. The earlier text called the
generator the agents' own. This revision corrects that and names the authors (NOTICE, section 6).

## 5. What is new in the second and third revisions, in plain words

Words. An *array* is one working copy of the data, of length n. Its *frame* is the coordinate system it is
written in at a given moment. A *move* takes an array to a larger frame, and a *block* is a run of moves of one
array; blocks are the only thing that costs, a block of rank r being one recursive call on r/m of the
coordinates. An addition between two arrays is free and is allowed only when both stand at the same frame.

- **The general frame lemma.** In the first result a frame is given by a set of mutually orthogonal unit
  directions of the label space F_2^m, and a block adds such directions. The lemma says that every subspace U of
  F_2^m can serve as a frame, and that an array goes from the frame of U to the frame of any larger subspace V
  in one block of rank dim V - dim U. "Every" includes the *degenerate* subspaces, those that contain a non-zero
  vector orthogonal to the whole subspace; they have no basis of orthogonal unit directions. The community
  states the lemma in a written note (`notes/general-clifford-frames.tex` in the CrocSwap repository), and
  every one of their figures above 7.4e-5 rests on it. `Work/GFrame` proves it in Lean for the family-130 RAM
  model (`frame_lemma`; 54 modules; by the auditing agent's reading the final proof uses it in the form
  `SMv.of_sub`, `Work/GFrame/Labels/StageBSem.lean`). Also proved there: two frames of the same subspace
  differ by a free step, and a block between two subspaces of which neither contains the other has rank
  dim U + dim V - 2 dim(U ∩ V).
- **The generalised engine.** The engine is the part of the proof that turns a schedule of blocks and free
  additions into one RAM program with a time bound. OpenAI's engine, and the first engine here, know frames of
  orthogonal unit directions. The generalised engine accepts every frame of the lemma. For that it has two more
  free steps on a single array (the "adapter" steps), a permutation of addresses and a multiplication by a
  power of i that depends on the address, and it proves that each is one linear pass, like the free steps that
  existed before. It has a whole-block theorem only.
- **The extended checker.** A certificate is now one ordered list of single additions "target += c * source",
  each with the frame at which it happens, and a table of the frames, each a subspace given by a basis. The
  checker is a Lean function with two halves. The label half follows every array through the list: its frames
  must be nested, the arrays of an addition must stand at the same frame, and every climb is counted as one
  block of its rank. The scalar half replays the additions in exact arithmetic and tests that they compose to
  the exchange the network needs, whatever old content the helper arrays hold. Theorems in `Work/GCert` say
  that a certificate accepted by both halves gives one invocation at the counted price, and they carry the
  bridged five-stage network of the first result over to the generalised engine.
- **The circuit.** The community's paired-cube circuit at p = 11 ("Whose circuit this is", above; sizes in
  section 6), written as a certificate in that format. By the agents' count 91 percent of its moves pass
  through frames that the first engine cannot use. That is why the three items above had to exist first.
- **The seam and the repeated reduction (third result).** OpenAI's route from the kernel program to every
  length asks one thing of the network: a kernel program within a work bound. In their files the bound is the
  fixed function `hills`, the ceiling of (k+1)^alpha. `Work/Fourier/Seam.lean` states the kernel program of
  the generalised engine in exactly that form, with the bound `hillsZ` at my exponent (`hillsZ_program`), and
  proves what the reduction uses of the bound: it is at least 1, it grows with k, it is at most k + 1 and at
  most 2 (k+1)^z, and z lies between 0 and 1 and below the exponents of OpenAI's statement. The 11 files
  after it are OpenAI's, repeated with that bound ("Whose reduction this is", above).
- **The new unit as a data file (fourth result).** The certificate of the fourth result is a file in the
  format of the extended checker, and the checker needed no change. It uses the format more freely than the
  certificate of the second result did. The scatter, the one step that hands the totals to the targets, is a
  table (in the second result: one fixed rule). There are 8 totals, all at the full frame of dimension 9 (22
  totals, two dimensions below the full frame). Gates are written in a form that adds arrays into one helper
  or target (in the second result that form occurs only for source into source). The sources are read by
  helpers before the scatter. Helpers are added into helpers before the scatter, with halves among the
  coefficients, and a helper that has served takes a new value. The agents first
  read the checker's Lean functions and found them general: one function for every addition, one for every
  move. The builds then had the kernel evaluate them on these certificates. The certificate of this revision
  has a few kinds of step that neither of the two earlier units built in Lean on 2026-10-10 had (a source
  added into a helper with the coefficient 1/2, in-place pairs with a half as the first coefficient, a helper
  that climbs from a line to the full frame in one block); the Lean build of this revision is the first
  kernel evaluation of those.

## 6. The design

OpenAI's proof reduces the saving to a finite network. In the form used here: W arrays, each to be transformed
along all m directions of a label space F_2^m. One *move* transforms one array along one direction and is what
costs. Additions between arrays with equal labels are free. The plain schedule needs W m moves. A network that
needs only W m - D moves gives a positive saving, larger when D / (W m) is larger. The steps to the network of
the first result:

- **Bank pairs and the helper circuit.** A bank pair is two data arrays that exchange their contents through
  additions. The exchanges are what saves moves. One *invocation* serves v pairs and needs R *helper* arrays
  that hold the partial sums. Helpers make all m moves and save nothing, so R is the main cost. In the first
  result v = C(h,3), one pair per 3-subset of h points, and the circuit started from the outside circuit NStar3
  with carrier links.
- **Folded layout.** Earlier layouts index the pairs by a grid, which forces m = h^2. Indexing pairs and
  invocations by a group of isometries needs only m of about s h for s stages of invocations, linear in h.
- **One helper set for all stages.** The same R helpers serve one invocation in every stage. A re-framing lemma
  lets an invocation start with helpers that still hold old values.
- **Bridged five-stage word.** Every pair gets a twin, a second pair whose labels equal its own at three moments.
  Free additions between twins then exchange two pairs with five invocations in place of six. m = 5h, W = 4v + R.
- **Carrier certificates.** A wider certificate format in which the data arrays themselves take part in the
  additions, carry intermediate values and are read in place. This removes helpers. It needed a new invocation
  theorem, a checker and its soundness proof.
- **Searched addition order.** The order and grouping of the additions in the helper circuit was optimised by
  computer search. Together with the carrier format this brought R from 11,500 to 7,122.

Who published which of these ideas, and when, is in RELATED-WORK.md, sections 1 and 2.

**The second result** keeps the bridged five-stage word and replaces the helper circuit by the community's
paired-cube circuit ("Whose circuit this is", above). There the h = 2p coordinates come in p = 11 pairs. A
*port* takes one coordinate from each of three pairs, so v = 8 C(p,3). The 8 ports on the same three pairs form
a *cube*, and the circuit is 165 cubes, each with the same small local circuit on its 8 inputs, and the sums
that connect the cubes. Helper arrays that are no longer needed are handed to new users, and inside a cube two
arrays that hold a and b are turned into a + b and a - b in place.

| | h | v | m | R | W = 4v + R | D | moves per unit, in place of W m | one invocation |
|---|---|---|---|---|---|---|---|---|
| fourth result | 9 | 120 | 45 | 783 | 1,263 | 120 | 56,715 of 56,835 | 3,974 blocks, 9,039 moves |
| second and third results | 22 | 1320 | 110 | 9412 | 14,692 | 3080 | 1,613,040 of 1,616,120 | 70,169 blocks, 262,944 moves |
| first result | 16 | 560 | 80 | 7122 | 9362 | 1035 | 747,925 of 748,960 | 37,286 blocks, 130,993 moves |

The blocks of one invocation are counted by the kernel, rank by rank. For the second result the two totals
are the Lean theorems `inv_count` and `inv_moves` (`Work/GCert/Data/P193Price.lean`); for the fourth they are
in `Work/GCert/Data/E8Price.lean`.

**The fourth result** keeps the bridged five-stage word and replaces the helper circuit once more, this time
by a circuit for another family of pairs. There are h = 9 coordinates and v = 120 pairs. The label of a pair
is a word of 9 bits with three ones (84 of them) or with seven ones (36). The agents named the family E8. Two
pairs know each other when their labels overlap in an even number of places; each pair knows 56 others. After
the scatter each target holds its own source and, with either sign, an unwanted half of each of the 56 sources
it knows: 6,720 unwanted terms, which the helpers have to take away. The wasteful way is one helper per term.
The circuit of the fourth result shares partial sums among the targets: a helper holds a sum of several
sources with signs, larger sums are made from two smaller ones, and where two targets want u + v and u - v
both are formed in place on the two helpers that held u and v. Which sums to form is chosen by an integer
programme over a pool of 1,470 candidate sums. Four passes then save helpers and blocks: a source is read
directly where a helper would only hold a copy of it; a helper that nothing reads any more takes a new value;
totals are built on helpers that have already served; and the frames and the order of the gates are chosen
again. The result is 783 helpers, 6.5 per pair, where the second result has 7.1 per pair, on labels less than
half as wide: the label space has dimension m = 5h = 45 in place of 110. Of the 480 moves that the 120
exchanges could save per unit, the scratch copies of the 8 totals take back 360 (section 7).
[notes/how-the-e8-unit-was-found.md](notes/how-the-e8-unit-was-found.md) has the whole account, step by
step with figures.

## 7. An open direction: the scratch copies

My weekly Claude limits ran out before I could chase this one, so here it is for anyone who wants it.

**What the copies are.** Every run of the helper circuit hands h totals to all the outputs at one moment (the
scatter). For that, each total is copied into a scratch array, and the copy has to make moves of its own: 22
copies of 20 moves in the circuit of the second result (cst = 440 moves per invocation), 15 copies of 15 moves
and one of 16 in my circuit of the first (cst = 241). These moves buy nothing. In the five-stage word the number of moves
saved per unit is D = 4v - 5 cst: the exchanges could save 4v, and the copies of the five invocations take
5 cst of it back.

**What they cost.** Between two fifths and a half of the saving this design could reach is eaten by the
scratch copies that every run of the helper circuit needs. A what-if computation says that removing them
entirely would raise the second result by a factor 1.71 and would roughly double the first:

| circuit | 4v | 5 cst | share eaten | saving proved | WHAT-IF: no copies |
|---|---|---|---|---|---|
| fourth result (h = 9) | 480 | 360 | 75.0 % | 8.762479e-4 | not computed for this text |
| second result (community circuit, h = 22) | 5280 | 2200 | 41.7 % | 7.474547e-4 | 1.28147e-3 (x1.71) |
| first result (my circuit, h = 16) | 2240 | 1205 | 53.8 % | 5.399225e-4 | 1.16867e-3 (x2.16) |

In the unit of the fourth result the copies weigh more than in either earlier one: 8 totals at dimension 9,
cst = 72, so the copies take back 360 of the 480 moves the exchanges could save, and D = 120. One copy move
is about 4 percent of that saving. A paper argument with scripts, which nobody has read yet, says that 72 is
forced for 8 totals with the scatter used here and that no circuit for this family can go below 55; the range
55 to 71 is open. [notes/open-directions-2.md](notes/open-directions-2.md) has this and the other leads of the
fourth result. The rest of this section was written on 2026-10-09 about the first two circuits.

The last column is a what-if and not a result. It is the block list of the same network with the copy blocks
and their loss deleted and everything else unchanged, priced by the rate calculator (whole-block accounting,
eight decimals, truncated; the same calculator gives 7.4745e-4 and 5.3992e-4 for the two networks as they
are). No circuit is known that reaches it. `python3 tools/whatif_copies.py tools/certificate/gcert1-p11-pr193.json.gz tools/certificate/c2-combine-best-h16.json` recomputes both rows.

**What is known.**

- One unit of copy rank costs 5 units of D. In the first network that is 0.48 percent of the saving per unit,
  as much as 41 helper arrays.
- Small steps exist. Retaining a different total in my circuit brings cst from 241 to 240 (worth 151 units of
  10^-8; found by the agents, not in Lean). The community's star rule, h copies of h - 2 moves, is already
  below the (h-1)^2 + h of my circuit.
- An earlier round of this project settled one class negatively. If the copies move along coordinate
  directions and are read only by the outputs, every identity over triples (the kind my circuit uses) needs cst
  of at least h(h-3), and the identity of my circuit needs at least h(h-1). Even the floor h(h-3) would give at
  most a factor 1.25 at h = 16 (computed for the three-stage word). Halving the loss is excluded in that class.
  This is a derivation on paper with computer checks at small sizes, and one step quotes an outside theorem.
  It is not a Lean theorem.
- That finding predates the general frame lemma in this repository. The copies may now stand at any subspace,
  degenerate ones included. What that allows for the copies has not been examined in this project.

No design for that is known yet. If you find one, the checker and pipeline in this repository will take it as
data: a circuit in the certificate format of section 5 is a data file. The note `notes/scratch-copies.md` has the
formulas and says where each of the four points above comes from.

### The other open directions

[notes/open-directions.md](notes/open-directions.md), written on 2026-10-09, hands the project on: every lead I
knew of then, with what is known, what it might give, how to start, and what already failed.
[notes/open-directions-2.md](notes/open-directions-2.md) adds the leads of the fourth result: what the search
of 2026-10-10 did not try and what may be promising.

- **Major leads.** The scratch copies above (what-if 1.28147e-3, no design known); a per-rank theorem for the
  generalised engine (its rate inequality at 4.058344e-4 is a Lean lemma already); the room under the
  outside ceilings (#201, DaysSky, claims 2.5657e-3 and covers neither this circuit nor this layout); the
  Lean frame lemma and the checker, for what the multiplication project still assumes. The Fourier transform
  of every length was on this list and is now the third result; the note says what remains of it (A3).
- **Minor leads** (fourteen, each with its computed size and its label), **the checks I would welcome most**,
  **seventeen things that were tried and did not work**, and **how a better circuit becomes a theorem here**.

## 8. Layout

    OAI/          89 files of openai/math (lean/OAI/Computability), unmodified
    WHTCheck/     the first Walsh-Hadamard corollary; defines `wht` and `WHTProgram`
    Work/         291 modules: 252 of the first three results (237 written here for the first two, and
                  Work/Fourier) and 39 of the fourth.
                  First result: recursion engines and rate arithmetic (Scratch, Block*, FoldRate), invocation
                  and network theorems (SharedSumStructured, Combine, Reframe, Bridge, BridgeGeom, Carrier),
                  certificate checkers, data and final theorems (SharedSumChecker, CarrierCheck).
                  Second result: GFrame (frame lemma, generalised engine, 54 modules, 48 of them imported
                  by the final proof), GCert (extended checker in the parts Labels, Scalar and Chain; Data
                  with the certificate and the final theorem)
                  Third result: Fourier (15 modules: the seam file written here, the modified
                  copies of 11 OpenAI files and of five definitions of a twelfth, the challenge, and a file that prints the axioms of the final theorems;
                  the final theorems are in the copy of `Main`)
                  Fourth result (39 modules, in addition to the 252): 24 under GCert/Data, generated from the
                  new certificate (namespace `GXD.E8`, instance `B2Ge8`; the final theorem is in
                  `SolutionB2Ge8x`), and FourierE8 (15 modules, the twin of Fourier with the suffix `E8`)
    comparator/   the comparator configurations
    tools/        `Compare.lean`, the certificates as JSON (`tools/certificate/`), their reference checkers,
                  the generators (`tools/gen/` first result, `tools/gx/` second and fourth), `whatif_copies.py` (section 7),
                  `tools/fourier/` (the scripts that made the copies of the third and of the fourth result, and their checks),
                  `tools/rebuild/` (the programs that rebuild the certificate of the second result from the
                  community's data files; the data files are fetched, not included),
                  `tools/e8/` (the search programs that found the certificate of the fourth result)
    lakefile.lean, lean-toolchain, lake-manifest.json    Lean v4.34.1 and the Mathlib commit pinned by openai/math
    VERIFY.md     how to rebuild everything and re-run every check
    ORIGIN.md     where every file comes from (with MANIFEST.sha256); `tools/gx/ORIGIN.md` for the tools and
                  the certificates of the second and fourth results
    RELATED-WORK.md, NOTICE, LICENSE
    notes/, third-party/    the notes of section 7 (scratch copies; all open directions) and the four notes of the
                  fourth result (how the unit was found, what did not work, open directions 2, the results as JSON);
                  the note for readers from network coding (`for-network-coding-readers.md`, with the folder `network-coding/`);
                  the NOTICE file of CrocSwap/integer-mult-bounds (NOTICE, section 6);
                  OpenAI's challenge file `UniformFourier.lean`, unmodified, to compare the challenges of the third and fourth results with

The comments inside the Lean files were not edited for this release, so that the files are byte for byte the
ones that were checked. They still use path names and working titles of the tree they were written in ("Scratch
file", `checks/...`, "(key: ...)"). ORIGIN.md translates them.

## 9. Sources, dates and what was looked at

This section holds the dates, the commits and the outside pull requests behind the statements above. They are
kept out of the prose so that the prose can be read.

### For the opening and what is new

The four texts of this README:

- First text (first result): commit `024f763`, 2026-10-09.
- Second text (second result): commit `fdfb781`, with its note on open directions in commit `e0bbe1c`,
  2026-10-09.
- Third text (third result): commits `6a1d04f` and `f010392`, 2026-10-09.
- Fourth text (fourth result): this one, 2026-10-10.

OpenAI's work that the statement and the cost model come from: [openai/math](https://github.com/openai/math),
family 130, commit `fd4aeeb`.

The searches of public sources:

- They were read-only looks by the AI agents I directed. RELATED-WORK.md says what they covered and when.
- For the first three results they were made on 2026-10-09, the last at 18:11 UTC. Every "as far as I could
  find" and every "as of 9 October 2026" about those results speaks of that day.
- They were not repeated in full for the fourth revision. What was read again on 2026-10-10 is listed next.

What was read on 2026-10-10 for the sentence "the largest saving with a Lean proof that I know of" (all times
UTC):

- At 20:49 UTC the agents read the titles and descriptions of the 100 newest pull requests of
  CrocSwap/integer-mult-bounds, #233 to #332, read-only.
- The largest figure there with a reported Lean check, for the quantity of my Walsh-Hadamard theorem (the
  "complex side", five-stage layout), was 7795/10^7, in
  [#327](https://github.com/CrocSwap/integer-mult-bounds/pull/327) (DreamingOfClouds, 18:51 UTC). Its author
  reports a Lean kernel check of it at 1 - 7795973/10^10, made with the generators of this repository. It
  was not built here.
- The largest kappa in a title was then 7.77268e-4
  ([#332](https://github.com/CrocSwap/integer-mult-bounds/pull/332), eumemic, 20:17 UTC). Kappa is the saving
  for integer multiplication, another quantity (section 2, point 2).
- At 21:33 the agents read the list of that repository's pull requests again. Two more existed, #333 and
  [#334](https://github.com/CrocSwap/integer-mult-bounds/pull/334) (both eumemic). #334 has the largest kappa
  in a title, 7.77596e-4 (21:15), and keeps #327 as its complex side. Neither states a Lean build.
- A closed pull request there, [#246](https://github.com/CrocSwap/integer-mult-bounds/pull/246)
  (maxime-fleury), prices 8.3465e-4 for the complex side and calls it "a conditional priced target, not a
  witness". It is a price, so the sentence does not cover it.
- Those figures move within hours.
- The sentence is about figures with a Lean proof only. Prices without one, in that repository or elsewhere,
  are outside it.
- Between 21:25 and 21:35 the agents read the outside repositories for the Fourier statement again,
  read-only. These readings built nothing.
- Pull request #2 of this repository (Chafik Boukhalfa, the account chafreaky; open, head `837dc31`) states
  1 - 7547360/10^10 for the Fourier transform of every length and 1 - 7547361/10^10 for the Walsh-Hadamard
  transform. Its author reports the Lean build and the comparator runs for both. It was the largest outside
  figure with a Lean proof for the Fourier statement. The agents built it on a Linux machine that evening,
  and every module of it compiled (the next list).
- shea256/fourier-transform-below-nlogn was read at commit `62554f9` (04:53). Since commit `a101b36` (03:16)
  its selection is 7.547360e-4, marked "formalized", in place of 6.7e-4. Its words: "an incorporated upstream
  result with a reproduced Lean proof" and "it does not claim a new exponent of our own". The rebuild is
  reported by its author and was not built here.
- danadran01/exact-dft-power-saving was still at `1a7b25e`, with 3.2e-6.
- eumemic/exact-dft-bounds was still at `6f87d1a`, with 4.856e-4, written. Its open pull request #1
  (chafreaky) has written figures up to 7.099e-4, "not formally verified".
- openai/math was still at `fd4aeeb`.
- xangma/exact-fourier-circuits, which this README and RELATED-WORK.md had not named before: a Lean proof for
  every length with theta < 1 - 2/10^13 and an extra log log factor, in a machine model of its own. That is
  the size of OpenAI's saving. It is reported by its author and was not built here.
- Also looked at: the forks of openai/math pushed since 9 October (not every branch), GitHub's repository
  search, arXiv by title and abstract, and Hacker News.
- Not looked at: X, Zulip, Discord, forums, other code hosts, and the branches of forks of the community's
  repository that are not pull requests.
- In all of this the agents found no Lean proof, reported or built, of a saving of 8.7625e-4 or more for
  either statement.

The build of pull request #2 of this repository, on 2026-10-10 (all times UTC). It is Chafik Boukhalfa's
result on his own hand-over pairs:

- The agents built it at its head `837dc31`, between 20:38 and 21:51, on the rented Linux machine of
  section 3 (x86-64, Ubuntu 24.04, 51 GiB of memory). They built it on top of that machine's from-source
  build of the published tree of this repository (commit `f010392`).
- All 54 Lean modules that the pull request adds compiled, with no error.
- The two heaviest modules, `Work.GCert.Data.Gen.P233Scal0` and `Work.GCert.Data.Gen.P233Scal1`, built in
  574 s and 642 s. The largest process of each held about 13 GB (13.3 GB and 13.4 GB). The 54 modules took
  66 minutes in all, on a machine that other jobs shared.
- His three theorems, `wht_main_block_B2Gp233x`, `transform_mainY` and `convolution_mainY`, depend on
  `propext`, `Classical.choice` and `Quot.sound`, and on no other axiom.
- `tools/Compare.lean` printed `RESULT: PASS` for his Walsh-Hadamard challenge and solution and for his
  Fourier challenge and solution, with the constant counts that he states (38871; 43381 and 43404).
- Not run in that build: the official comparator on his two configurations. He reports those runs himself.
- Mathlib was not compiled there. Its compiled files came from Mathlib's cache.
- The Python checks of his certificate were made on the Mac earlier that day, not on the Linux machine
  ("Whose circuit this is").
- On the Mac (16 GB of memory) 36 of the 54 modules built. The build could not finish there, because the
  two heaviest modules need about 13 GB each.
- His files are not merged, so these three theorems are in his pull request and not in this repository.

The pull requests behind "Whose ideas the new unit uses" (all in CrocSwap/integer-mult-bounds unless marked):

- The in-place pair: icekylinx, [#184](https://github.com/CrocSwap/integer-mult-bounds/pull/184); carried in
  ikeboy's #191 and #193.
- The re-use of finished helpers: jamesyc, [#124](https://github.com/CrocSwap/integer-mult-bounds/pull/124),
  and eumemic, [#143](https://github.com/CrocSwap/integer-mult-bounds/pull/143).
- The late pairing rule: Chafik Boukhalfa (the account chafreaky),
  [#200](https://github.com/CrocSwap/integer-mult-bounds/pull/200) and
  [#233](https://github.com/CrocSwap/integer-mult-bounds/pull/233), and pull request #2 of this repository.

The outside figures in "What was new in the first three revisions":

- 7.009184e-4, the largest outside figure for the quantity of the second result when it was published:
  CrocSwap/integer-mult-bounds, pull request #193; read again at 18:11 UTC on 2026-10-09.
- 7.547361e-4: the price that `gxdry.py` computes for the same circuit with chafreaky's hand-over pairs, which
  are in pull request #233. His pull request #2 of this repository has that figure as a Lean theorem, which
  the agents built on a Linux machine (the list above).
- 7.635875e-4: the price that `gxdry.py` gives to the certificate of pull request
  [#304](https://github.com/CrocSwap/integer-mult-bounds/pull/304) (DreamingOfClouds), which states 7635/10^7
  for it. #304 is also the pull request that applies the five-stage formula and credits this repository for
  the layout.
- 3.2e-6: [danadran01/exact-dft-power-saving](https://github.com/danadran01/exact-dft-power-saving), an
  outside Lean proof of the Fourier statement; not built here. 6.7e-4: shea256, an outside written argument;
  conditional, not formalised. Both as the searches of 2026-10-09 found them. On 2026-10-10 shea256's
  repository gave 7.547360e-4 instead (list above).

### For the credits

What "as far as I could find", "that I know of" and "as of 9 October 2026" rest on, in the two sections "Whose reduction this is" and
"Whose circuit this is":

- The AI agents I directed looked at public sources, read-only. RELATED-WORK.md says what they covered and
  when.
- The last of those looks for the first three results was on 2026-10-09 at 18:11 UTC.
- They were not repeated in full for the fourth revision. The repositories below and the newest pull
  requests of the community's repository were read again on 2026-10-10 ("For the opening and what is new",
  above).

The three outside repositories for the Fourier statement:

- danadran01/exact-dft-power-saving: read at commit `1a7b25e` (2026-10-09 03:48 UTC). It was not built here.
- shea256/fourier-transform-below-nlogn: first commit 8 October 2026. Read on 2026-10-09 at 18:11 UTC, at
  commit `a2840b1`; its figure was 6.7e-4 then.
- eumemic/exact-dft-bounds: read at commit `6f87d1a`.
- All three were read again on 2026-10-10, between 21:25 and 21:35 UTC. The first and the third had no new
  commit. shea256's was at commit `62554f9` and gave 7.547360e-4 ("For the opening and what is new", above).

The community's repository, CrocSwap/integer-mult-bounds:

- #144 (icekylinx, the paired-cube construction) has been in its main branch since 2026-10-09 05:06 UTC.
- The pull requests behind the circuit of the second and third results: #144, #168, #184, #191 and #193.
  Credited through them: #117, #128, #162 and #163.
- The other choice of hand-over pairs: #233 and #200 there, and issue #1 and pull request #2 of this
  repository.

### For the results, the limits and the checks

**The readings of the community's pull requests** (section 2, point 2). The repository is
CrocSwap/integer-mult-bounds. All times are UTC. Kappa is the saving for integer multiplication; the
complex-side saving is the quantity of my theorem.

- 2026-10-09, 16:06. Pull requests up to #207 existed.
  - Largest kappa in a title: 6.831905e-4 (#207, Dugongue, open, 16:00).
  - Largest complex-side saving stated in any of the bodies of #193 to #207: still 7.009184e-4, the circuit
    of #193. #194, #197, #202, #204, #205, #206 and #207 keep that circuit while they change the bit side.
  - The front page of that repository's main branch (`3b6b668`) named #186 as its reviewed result (kappa
    6.61885549e-4).
- 2026-10-09, 18:11. Pull requests up to #215 existed.
  - Largest kappa in a title: 6.839217e-4 (#210, eumemic, open, 16:58).
  - Largest complex-side saving stated as a result in the bodies of #208 to #215: still 7.009184e-4, the
    circuit of #193, which #210, #211 and #213 keep.
  - #208 prices further steps, up to kappa 1.226488e-3. Its title calls them "target, not built".
- 2026-10-10, 20:49. Pull requests up to #332 existed. The 100 newest, #233 to #332, were read.
  - Largest kappa in a title: 7.77268e-4 (#332, eumemic, open, 20:17).
  - Largest complex-side saving with a reported Lean check: 7795/10^7 (#327, DreamingOfClouds, open, 18:51),
    for a word at h = 20 in the five-stage layout of this repository. Its author reports a Lean kernel check
    of it with this repository's generators. It was not built here.
  - A larger complex-side figure is priced in #246 (maxime-fleury, closed): 8.3465e-4, which its own text
    calls "a conditional priced target, not a witness". It states no Lean check.
- 2026-10-10, 21:33. Pull requests up to #334 existed. The list was read again, with the descriptions of #246,
  #327 and #334.
  - Largest kappa in a title: 7.77596e-4 (#334, eumemic, open, 21:15). It keeps #327 as its complex side and
    states no Lean build.
  - Largest complex-side saving with a reported Lean check: still 7795/10^7 (#327).

**The runs of the first three results** (section 3). All were made on 2026-10-09, on the Mac. Times are UTC;
the seconds are the duration of the run.

- First result, comparator:
  - by the agent that built the proof: whole-block theorem 09:59, per-rank companion 10:03;
  - by an auditing agent with its own configuration: whole-block theorem 10:09;
  - in a rebuild from scratch: whole-block theorem 11:32, per-rank companion 11:35.
- Second result:
  - comparator in the project's working tree, by the agent that built the proof: 15:14 (1814 s);
  - comparator in the project's working tree, by an auditing agent with its own copy of the configuration:
    15:43 (1116 s);
  - `lake build --no-build` of all eight roots in the build copy of the repository, every target up to date:
    15:48 (9250 jobs);
  - comparator in the build copy: 16:13 (1058 s);
  - `tools/Compare.lean` in the build copy, `RESULT: PASS`: 16:15 (148 s).
- Third result:
  - comparator in the project's working tree, by the agent that built the proof: 18:27 (1528 s);
  - comparator in the project's working tree, by an auditing agent with its own configuration: 18:55
    (1236 s);
  - comparator in a copy of the repository: 19:01 to 19:20 (1137 s);
  - `tools/Compare.lean` in that copy: 19:23.

**The first result** was published on 2026-10-09 as commit `024f763` (section 1).

**The Walsh-Hadamard statement, line by line** (section 1, "Whose statement the Walsh-Hadamard one is").

- Lines 22 to 270 of my challenge file are the RAM cost model. They are OpenAI's, byte for byte: lines 9 to
  257 of their `lean/ComparatorChallenges/UniformFourier.lean`.
- Lines 271 to 331, about 60 lines, define `wht`, `WHTProgram` and `WHTTimeBoundsAt`. They are my project's.

**The fourth result.** It was found, built and checked on 2026-10-10. Its runs, with commands, times and
memory, are in [VERIFY.md](VERIFY.md), section 10.
