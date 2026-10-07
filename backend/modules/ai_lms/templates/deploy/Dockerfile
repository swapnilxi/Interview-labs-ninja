# {{CLASS_NAME}}: a static site exported from AI LMS, served by nginx.
# Google Cloud Run:  gcloud run deploy {{CLASS_SLUG}} --source . --allow-unauthenticated
# Locally:           docker build -t {{CLASS_SLUG}} . && docker run --rm -p 8080:8080 {{CLASS_SLUG}}
FROM nginx:1.27-alpine

# Cloud Run sends traffic to $PORT (8080 unless configured otherwise); the nginx image
# fills ${PORT} into /etc/nginx/templates/*.template when the container starts.
ENV PORT=8080
COPY . /usr/share/nginx/html/
RUN mkdir -p /etc/nginx/templates \
 && mv /usr/share/nginx/html/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
