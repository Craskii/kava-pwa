# Kava PWA

This is a [Next.js](https://nextjs.org) project.

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Syncing the `work` branch

Use these steps to pull the latest code the assistant committed:

### GitHub Desktop
1. Open the repository.
2. Switch to the **work** branch.
3. Click **Fetch origin**, then **Pull**.

### Terminal
```bash
git checkout work
git pull
```

## Resolving merge conflicts on `src/app/t/[id]/page.tsx`

If you see a prompt about unresolved conflicts (for example in Android Studio, VS Code, or GitHub Desktop) while merging the tournament work into another branch:

1. Continue the merge so the file opens with the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Avoid force-merging without reviewing the differences.
2. In `src/app/t/[id]/page.tsx`, keep the parts that preserve host-gated drag-and-drop, tournament format settings (format, team size, groups), and the late-join seating helpers. Remove the conflict markers before saving.
3. Run `npm run lint` to confirm the file is syntactically valid.
4. Stage the resolution and finish the merge (`git merge --continue`), then push the branch.

## Deploying to Cloudflare Pages

1. Build the project locally to confirm it compiles:
   ```bash
   npm run build
   ```
2. From the repo root, publish to Cloudflare Pages (requires Wrangler login):
   ```bash
   npx wrangler pages deploy .next --project-name <your-project-name> --branch work
   ```

If the project uses a different Pages workflow, adjust the deploy command to match your configuration.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
