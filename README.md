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
