# AI Consultant Landing Page

Welcome to the AI Consultant Landing Page project! This is a fully customizable, modern, and dark-themed web presence designed specifically for AI strategy consultants. It dynamically generates a beautiful portfolio site from a simple data file. 

The best part? This project is **$0 to host** and requires **no monthly subscriptions**! It runs entirely on free GitHub tools.

## How to Set Up Your Own Site

Follow these steps to deploy your own version of this landing page.

### Step 1: Fork the Repository
1. In the top-right corner of this page, click the **Fork** button.
2. Create a copy of this repository under your personal GitHub account.

### Step 2: Enable GitHub Actions Permissions
Because this project automatically builds your site for you, GitHub Actions needs permission to save the built page back to your repository.
1. In your forked repository, click the **Settings** tab.
2. On the left sidebar, expand **Actions** and click **General**.
3. Scroll down to the **Workflow permissions** section.
4. Select the option for **Read and write permissions**.
5. Click **Save**.

### Step 3: Configure GitHub Pages
We use GitHub Pages to host your site for free!
1. In your repository's **Settings**, click on **Pages** in the left sidebar.
2. Under the **Build and deployment** section, ensure the **Source** is set to **Deploy from a branch**.
3. In the **Branch** dropdown, select the **gh-pages** branch. *(Note: If you don't see `gh-pages` yet, complete Step 4 first to trigger the initial build!)*
4. Click **Save**. 

### Step 4: Access the Admin Dashboard
You don't need to touch any code or navigate GitHub files to update your website! You can use the built-in Admin Dashboard directly on your live site.
1. Generate a **GitHub Personal Access Token (PAT)** by going to your GitHub Settings > Developer Settings > Personal access tokens > Tokens (classic). Ensure it has the `repo` scope selected.
2. Go to your live website and add `/admin.html` to the URL (e.g. `https://yourusername.github.io/yourrepo/admin.html`).
3. Enter your repository name (e.g. `yourusername/yourrepo`) and paste your secure Personal Access Token.
4. Edit your content visually! When you click **Save Changes**, the dashboard will securely push the updates to GitHub.

**That's it!** Every time you click "Save Changes" in the admin dashboard, a GitHub Action will automatically run in the background, rebuild your HTML site, and publish it. Within a minute or two, your live website will reflect your latest changes.