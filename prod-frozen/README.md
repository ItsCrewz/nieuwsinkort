# prod-frozen

Exacte kopie van de productiesite zoals die live stond op 28 oktober 2026 (index-Bai6oqw9.js /
index-BzWXPaQR.css / hls-ldmpDFfV.js), gedownload van https://nieuwsinkort.pages.dev.

Zolang `DEPLOY_BRANCH` iets anders dan `main` bevat, zet `deploy.sh` deze map + de verse
`public/data.json` (+ de Pages Functions uit `functions/`) op productie (main), zodat de live
site nieuws blijft krijgen terwijl het nieuwe design alleen als preview draait.

Niet met de hand aanpassen. Na goedkeuring van het nieuwe design (DEPLOY_BRANCH=main)
is deze map niet meer nodig.
