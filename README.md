<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1SUXXWedrqpucS3b0Y69pt_MDvEd_lSet

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Dépendance tldts
Ce projet utilise `tldts` pour classifier 1st/3rd-party (eTLD+1). Si tu mets à jour depuis une ancienne version, supprime `node_modules` + `package-lock.json` puis relance `npm install`.
