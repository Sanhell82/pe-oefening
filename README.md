# Permanente evaluatie Github Actions
## Voorbereiding
Open deze repository met Visual studio code op je lokale laptop. Dit doe je door rechts bovenaan op de knop "code" te klikken en daarna via `git` de code te clonen op je toestel. 
Tijdens de opdracht mag je enkel gebruik maken van:
- Zelf gemaakte documentatie
- Het portaal van je Github repository & de [Github Actions marketplace](https://github.com/marketplace?type=actions)
- Visual studio code als IDE met eventueel de YAML extensie van redhat.

Het gebruik van AI tools en AI plugins is niet toegestaan en wordt gezien als fraude. Toezichters zullen steekproefgewijs controleren of studenten enkel gebruik maken van het toegelaten materiaal. Het is niet toegestaan om extra extensies te installeren in de IDE.

## Inleiding

Voor deze PE opdracht is deze repository gegeven. Deze repository bevat de code van een nodeJS applicatie alsook deze `README.md` file met daarin de opgave.

Tijdens deze opdracht werk je 2 workflows (pipelines) uit in Github Actions. Je voegt deze workflow files toe op de juiste plaats aan deze repository. De stappen van deze workflows worden hieronder besproken.

## Deel 1 - quality.yml

### Triggers
Deze wordt uitgevoerd bij:
1. Het openen van een pull request

### Vereiste stappen
Je mag altijd stappen toevoegen indien nodig.

- Fetch code: checkout van de repository (gebruik actions/checkout).
- Install dependencies: gebruikt `npm install` om de nodige dependencies te installeren
- Check code quality: run ESLint. De workflow moet falen als ESLint fouten aanwezig zijn. Tip: Je kan dit testen door regel 7 in `app.js` te uncommenten
- Unittests: voer `npm test` uit. Verzamel testresultaten in een rapport (bijv. JUnit XML of een formaat dat een test-reporter ondersteunt).
- Archive / Upload reports: gebruik een test-reporter zodat de testrapporten zichtbaar zijn in de workflow-run of gekoppeld aan de PR. (Je kunt een marketplace action gebruiken om testresults in het Actions UI te tonen.)

Bouw een nieuwe feature in de applicatie aan de hand van de Github Flow. Deze gebruik je om aan te tonen dat de quality worfklow uitgevoerd wordt bij het openen van je Pull request. Je hoeft niets toe te voegen in de aparte branch. Een witregel is voldoende. Je hoeft de pull request niet te mergen.

Voor de evaluatie bekijken we de laatste open pull request in je repository. Je mag zoveel pull requests / branches maken als je wil.

## Deel 2 - ci.yml

### Triggers
Deze workflow wordt uitgevoerd bij:
1. **Automatisch**: Nieuwe pushes naar de `main` branch
2. **Handmatig**: Via de "Run workflow" knop in GitHub Actions

### Vereiste stappen
Je mag altijd stappen toevoegen indien nodig.

- Fetch code: checkout repository.
- Build docker image: bouw een image met als naam `<dockerhubUsername>/pxl-app` en tag `:<commit_hash>` (gebruik GITHUB_SHA of laatste cijfers daarvan).
- Push docker image: push de image naar DockerHub. Gebruik GitHub Secrets voor credentials.

Zorg voor minstens één succesvolle run van deze pipeline.

Voeg in onderstaande code block de url toe van je Dockerhub repository van de container:

```
/olenasangare/pxl-app:<commit-hash>
```

## Indienen
/olenasangare/pxl-app:latest

Volg volgende stappen om je werk in te dienen:

1. Controleer of beide workflow files aanwezig zijn in je Github Repository
2. Controleer of je een openstaande pull request hebt waarbij de `quality.yml` workflow gedraaid heeft.
3. Controleer of je een succesvolle run hebt van de `ci.yml` workflow.
4. Controleer of je de url naar je dockerhub repository hebt toegevoegd aan regel 58 van deze `README.md` file.
5. Commit de laatste versie van je werk met het commit bericht "einde examen" en push deze naar Github.
6. Roep de docent, deze controleert de laatste commit op Github. Hierna mag je het lokaal verlaten.

