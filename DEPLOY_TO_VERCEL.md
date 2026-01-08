# Deploying TradeJournal AI to Vercel

You can deploy this Vite + React project to Vercel easily. Here are two methods:

## Method 1: Using the Vercel CLI (Recommended for quick deploy)

This method deploys directly from your computer without needing a GitHub repository.

1.  Open your terminal in the project folder.
2.  Run the following command:
    ```bash
    npx vercel
    ```
3.  Follow the prompts:
    -   **Set up and deploy?** `Y`
    -   **Which scope?** (Select your account)
    -   **Link to existing project?** `N`
    -   **Project Name:** (Press Enter to keep default)
    -   **In which directory is your code located?** `./` (Press Enter)
    -   **Want to modify these settings?** `N` (Vite settings are auto-detected)
4.  **Environment Variables**:
    -   Go to the [Vercel Dashboard](https://vercel.com/dashboard).
    -   Select your new project.
    -   Go to **Settings** > **Environment Variables**.
    -   Add `GEMINI_API_KEY` with the value from your `.env.local` file.
    -   **Redeploy** for the changes to take effect (Command: `npx vercel --prod`).

## Method 2: via GitHub (Recommended for automatic updates)

1.  Push your code to a GitHub repository.
2.  Log in to [Vercel](https://vercel.com).
3.  Click **Add New...** > **Project**.
4.  **Import** your GitHub repository.
5.  In the **Environment Variables** section, add:
    -   Key: `GEMINI_API_KEY`
    -   Value: (Your actual API Key)
6.  Click **Deploy**.

## Important Note

Your application uses `ENV.GEMINI_API_KEY`. Ensure this is added in the Vercel project settings, otherwise the AI features will not work in the deployed version.
