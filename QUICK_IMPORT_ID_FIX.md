Quick Import avatar ID validation fix

Fixed app/api/quick-import/save/route.js to accept valid VRChat avatar IDs in the format avtr_8-4-4-4-12. Previously it required an extra four-digit group and returned HTTP 400.

Replace repository files, commit to main, and redeploy on Vercel. This fixes input validation; successful GitHub write still depends on the deployment environment and repository permissions.
