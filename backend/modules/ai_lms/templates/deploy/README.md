# {{CLASS_NAME}}

A static-site export of this class from AI LMS: `landingpage.html` (opened from `/` via
`index.html`), every lesson and project module page, and `class.json` (titles, order,
file list). Pages link to each other with relative paths, so the folder works on any
static host as is.

## Deploy to Vercel

From this folder:

    npx vercel deploy --prod

Or push the folder to a Git repository and import it at https://vercel.com/new. There is
no build step; `vercel.json` marks it as a plain static site.

## Deploy to Google Cloud Run

From this folder, with the gcloud CLI logged in and a project selected:

    gcloud run deploy {{CLASS_SLUG}} --source . --region us-central1 --allow-unauthenticated

Cloud Build builds the `Dockerfile` (nginx serving these files on `$PORT`), and Cloud Run
prints the service URL when it's done. Pick any region and service name you like.

## Run it locally

    docker build -t {{CLASS_SLUG}} . && docker run --rm -p 8080:8080 {{CLASS_SLUG}}

then open http://localhost:8080. Without Docker: `python3 -m http.server 8080`.
