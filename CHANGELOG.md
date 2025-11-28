# Ändringslogg

Alla viktiga ändringar i projektet dokumenteras i denna fil.

## [2.4.2] - 2025-11-28

### Tillagt
- **Svenska som standardspråk** - Alla verktyg använder nu `sv` som default istället för `en`
- **Central språkvalidering** - Endast `sv` och `en` accepteras, med tydlig varning vid ogiltigt språk
- **Fuzzy matching för svenska tecken** - "Goteborg" matchar nu "Göteborg", "Malmo" matchar "Malmö"
- **Förbättrad regionsökning** - Alla 21 svenska län + större kommuner finns nu i lokal fallback-data
- **Strukturerade JSON-felmeddelanden** - Konsistenta fel med `type`, `message`, `details` och `suggestions`

### Fixat
- **Felaktig regionskod för Lerum** - Kod 1484 pekade felaktigt på Lerum, nu korrigerat till 1441 (korrekt SCB-kod för Lerum kommun)
- **Lysekil tillagd** - Kod 1484 pekar nu korrekt på Lysekil kommun
- **scb_test_selection krasch** - Verktyget kraschar inte längre när `selection` saknas
- **pageSize-begränsning** - `scb_search_tables` begränsar nu `pageSize` till max 100
- **Borttaget scb_browse_folders** - Verktyget är nu helt borttaget (SCB API v2 stödjer inte `/navigation`)

### Förbättrat
- Bättre felhantering med hjälpsamma förslag
- Regionsökning kombinerar nu API-sökning med lokal fuzzy matching
- Alla handlers använder validerad språkparameter

### Säkerhet
- **body-parser DoS fix** - Uppdaterad till säker version (CVE-2024-45590)

## [2.4.1] - 2025-11-23

### Tillagt
- **HTML-dokumentation på root-path** - https://scb-mcp.onrender.com/ visar nu README.md som en snygg HTML-sida
- GitHub-liknande styling för dokumentationen
- Länkar till API Endpoint, Health Check och GitHub repo i header
- Responsiv design för mobila enheter

### Förbättrat
- README.md nu tillgänglig som både markdown och formaterad HTML
- Bättre användarupplevelse vid besök på root URL

## [2.4.0] - 2025-11-23

### Tillagt
- **6 Promptmallar** för strukturerade arbetsflöden:
  - `analyze-regional-statistics` - Analysera regional statistik
  - `compare-municipalities` - Jämför statistik mellan kommuner
  - `find-statistics-table` - Hitta rätt SCB-tabell
  - `build-custom-query` - Steg-för-steg guide för komplex query
  - `employment-trend-analysis` - Analysera sysselsättnings-/arbetslöshetstrend
  - `population-demographics` - Hämta demografisk information
- **Prompts capability** i MCP-server enligt officiell specifikation
- **render.yaml** för optimerad Render-deployment
- Fullständig MCP-protokollimplementation med tools OCH prompts

### Förbättrat
- README uppdaterad med prompt-dokumentation och exempel
- Server capabilities nu inkluderar både tools och prompts
- Bättre deployment-konfiguration för Render

## [2.3.0] - 2025-11-23

### Tillagt
- **5 tidigare oimplementerade verktyg nu funktionella:**
  - `scb_test_selection` - Validera selektioner innan API-anrop
  - `scb_preview_data` - Förhandsgranska data (max 20 rader)
  - `scb_browse_folders` - Navigera SCB:s databasstruktur
  - `scb_search_regions` - Sök regioner på namn (fuzzy search)
  - `scb_find_region_code` - Hitta exakta regionkoder för kommun/län

### Fixat
- **Verklig kvothantering:** `scb_check_usage` och `scb_get_api_status` visar nu faktisk API-användning istället för statiska värden
- **Korrekt metadata:** `query.table_id` i `get_table_data` visar nu rätt tabell-id istället för dimension-namn
- **Strukturerad felhantering:** Fel returneras som JSON-objekt med separata fält för HTTP-status, SCB-fel och meddelanden
- **Bättre felgranularitet:** 424-fel och andra fel inkluderar nu timestamp och strukturerad information

### Förbättrat
- Utökad region-sökning med typ-identifiering (county/municipality/country)
- Preview-data med automatisk selection om ingen anges
- Test-selection med hjälpsamma felmeddelanden och förslag

## [2.2.0] - 2025-11-23

### Borttaget
- Alla E-hälsomyndigheten-verktyg (ehealth_search_tables, ehealth_get_table_info, ehealth_get_medicine_data)
- Fokuserar nu enbart på SCB-statistik

### Ändrat
- Servernamn från "SCB & E-hälsomyndigheten Statistics Server" till "SCB Statistics Server"
- Antal verktyg från 14 till 11
- Uppdaterade beskrivningar för att reflektera SCB-fokus

## [2.1.0] - 2025-11-22

### Tillagt
- Fullständigt MCP-protokollstöd med initialize och initialized metoder
- HTTP transport med CORS-stöd
- Express-baserad HTTP-server

### Fixat
- OAuth/autentiseringsfel med Claude Code
- MCP-handshake-protokoll nu korrekt implementerat

## [1.0.0] - 2025-11-20

### Tillagt
- Initial release
- 11 SCB-verktyg för statistikåtkomst
- Automatisk variabelöversättning
- Förhandsvalidering av queries
- Rate limiting enligt SCBs API-specifikation
