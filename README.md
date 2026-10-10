# Big O Speedrun

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

## Hosting

On Vercel, select Astro, Node.js 22, build command `npm run build`, and output directory `dist`. The separate `api/chat.ts` function serves `/api/chat` and includes the generated `dist/chat-knowledge.json` file. Chat needs a server-side `ANTHROPIC_API_KEY`; `DISCORD_WEBHOOK_URL` is optional. Never commit these values. The static site can build without either value.

## License

Code is licensed under the [MIT License](LICENSE). Data is released under [CC0 1.0](data/LICENSE). Third-party papers, proofs and assets retain their own licenses.
