# Big O Speedrun

Live: https://bigospeedrun.com

Big O Speedrun tracks improved algorithmic bounds for classic problems. Each board shows exact-score rankings, source links, dates and evidence levels.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

The site runs at `http://localhost:4321`. `npm run build` creates the static site in `dist/`; `npm run preview` serves that build. Run `npm test` and `npm run check` before submitting changes.

## Data

The committed snapshot is in `src/data/`. Before development or a build, the sync script validates a data bundle and copies its JSON and referenced proof receipts. Set `BIGOSPEEDRUN_DATA_DIR` to use a separate bundle, or put it in `data/`. Without a bundle, a clean checkout builds the committed snapshot.

The hourly workflow fetches public CrocSwap and Swapnil Jain data from GitHub, validates it and commits updates using the automatic `GITHUB_TOKEN`. It reads source text and certificates without executing submitted code. Other research results need a reviewed import. See [data/README.md](data/README.md) for local refresh and validation commands.

## Adding a race

A race is a problem page or an Other bounds row. Every race that the site lists has exactly one board on [board.bigospeedrun.com](https://board.bigospeedrun.com) and exactly one channel on the [Discord server](https://discord.gg/JEN582WvNv). Add all three in the same change:

1. Site: add a problem to `data/registry.json` with its data file, or an Other bounds row to `src/lib/other-bounds.json`. Add its board slug to `boardSlugs` in `src/lib/board.ts`: `<slug>` for a problem, `other-<slug>` for an Other bounds row.
2. Board: after the site deploy, run `scripts/sync-boards.ts --write` in [bigospeedrun/board](https://github.com/bigospeedrun/board) and deploy the new migration. The script reads the race list from the live site.
3. Discord: a maintainer creates the channel with the server bot. It is a text channel in the category Big O (problems) or Other bounds (Other bounds rows). Its name is the race's site name in slug form: lowercase, apostrophes removed, and each other run of characters that are not letters or digits changed to `-`. For example, `Catalan’s constant` becomes `catalans-constant`, and the problem `exact-dft` (site name `Fourier Transform`) becomes `fourier-transform`. The channel has no permission overwrites, so it uses the permissions of its category. Put it in the site's order.

A race that the site does not list, such as `directed-sssp`, gets no board and no channel. If you rename a race, rename its channel too. An hourly check alerts the maintainers when a listed race has no board or no channel, or when a board or a race channel has no race.

## Hosting

On Vercel, select Astro, Node.js 22, build command `npm run build`, and output directory `dist`. The separate `api/chat.ts` function serves `/api/chat` and includes the generated `dist/chat-knowledge.json` file. Chat needs a server-side `ANTHROPIC_API_KEY`; `DISCORD_WEBHOOK_URL` is optional. Never commit these values. The static site can build without either value.

## License

Code is licensed under the [MIT License](LICENSE). [CC0 1.0](data/LICENSE) covers the data files we wrote, including the registry, problem files, schemas and our receipts. It does not cover `data/sources/`: third-party material there keeps its original license, with LICENSE/NOTICE copies beside the sources where available. See the [source license inventory](data/README.md#licenses) for missing copies. These terms also apply to copies distributed by the site.
