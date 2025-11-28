import { Resource } from '@modelcontextprotocol/sdk/types.js';

// Common Swedish regions with codes
export const commonRegions = [
  // Country level
  { code: '00', name: 'Riket (hela Sverige)', type: 'country' },

  // Counties (län) - 2-digit codes
  { code: '01', name: 'Stockholms län', type: 'county' },
  { code: '03', name: 'Uppsala län', type: 'county' },
  { code: '04', name: 'Södermanlands län', type: 'county' },
  { code: '05', name: 'Östergötlands län', type: 'county' },
  { code: '06', name: 'Jönköpings län', type: 'county' },
  { code: '07', name: 'Kronobergs län', type: 'county' },
  { code: '08', name: 'Kalmar län', type: 'county' },
  { code: '09', name: 'Gotlands län', type: 'county' },
  { code: '10', name: 'Blekinge län', type: 'county' },
  { code: '12', name: 'Skåne län', type: 'county' },
  { code: '13', name: 'Hallands län', type: 'county' },
  { code: '14', name: 'Västra Götalands län', type: 'county' },
  { code: '17', name: 'Värmlands län', type: 'county' },
  { code: '18', name: 'Örebro län', type: 'county' },
  { code: '19', name: 'Västmanlands län', type: 'county' },
  { code: '20', name: 'Dalarnas län', type: 'county' },
  { code: '21', name: 'Gävleborgs län', type: 'county' },
  { code: '22', name: 'Västernorrlands län', type: 'county' },
  { code: '23', name: 'Jämtlands län', type: 'county' },
  { code: '24', name: 'Västerbottens län', type: 'county' },
  { code: '25', name: 'Norrbottens län', type: 'county' },

  // Major municipalities (kommun) - 4-digit codes
  { code: '0180', name: 'Stockholm', type: 'municipality' },
  { code: '1480', name: 'Göteborg', type: 'municipality' },
  { code: '1280', name: 'Malmö', type: 'municipality' },
  { code: '0380', name: 'Uppsala', type: 'municipality' },
  { code: '0580', name: 'Linköping', type: 'municipality' },
  { code: '1281', name: 'Lund', type: 'municipality' },
  { code: '1880', name: 'Örebro', type: 'municipality' },
  { code: '1980', name: 'Västerås', type: 'municipality' },
  { code: '1780', name: 'Karlstad', type: 'municipality' },
  { code: '2180', name: 'Gävle', type: 'municipality' },
  { code: '0680', name: 'Jönköping', type: 'municipality' },
  { code: '1080', name: 'Karlskrona', type: 'municipality' },
  { code: '2280', name: 'Sundsvall', type: 'municipality' },
  { code: '2580', name: 'Luleå', type: 'municipality' },
  { code: '2480', name: 'Umeå', type: 'municipality' },
  { code: '1441', name: 'Lerum', type: 'municipality' },
  { code: '1484', name: 'Lysekil', type: 'municipality' },
  { code: '1481', name: 'Mölndal', type: 'municipality' },
  { code: '1482', name: 'Kungälv', type: 'municipality' },
];

// Popular/commonly used tables
export const popularTables = [
  {
    id: 'TAB638',
    name: 'Folkmängd efter region, civilstånd, ålder och kön',
    category: 'population',
    description: 'Befolkningsstatistik uppdelad på region, civilstånd, ålder och kön'
  },
  {
    id: 'TAB5663',
    name: 'Registerbaserad arbetslöshet',
    category: 'labour',
    description: 'Månadsvis arbetslöshetsstatistik per region'
  },
  {
    id: 'TAB4552',
    name: 'Befolkningens anslutning till kommunalt vatten och avlopp',
    category: 'environment',
    description: 'Statistik om VA-anslutning över tid'
  },
  {
    id: 'TAB4422',
    name: 'Folkmängd efter region, ålder och kön',
    category: 'population',
    description: 'Grundläggande befolkningsstatistik'
  },
  {
    id: 'TAB6473',
    name: 'Befolkningsstatistik per månad',
    category: 'population',
    description: 'Månadsvis uppdaterad befolkningsstatistik'
  }
];

// Available categories for searching
export const categories = [
  { id: 'population', name_sv: 'Befolkning', name_en: 'Population', keywords: ['befolkning', 'population', 'invånare', 'folk'] },
  { id: 'labour', name_sv: 'Arbetsmarknad', name_en: 'Labour Market', keywords: ['arbete', 'sysselsättning', 'arbetslöshet', 'employment'] },
  { id: 'economy', name_sv: 'Ekonomi', name_en: 'Economy', keywords: ['ekonomi', 'bnp', 'inkomst', 'gdp', 'income'] },
  { id: 'housing', name_sv: 'Boende', name_en: 'Housing', keywords: ['bostad', 'boende', 'lägenhet', 'housing'] },
  { id: 'environment', name_sv: 'Miljö', name_en: 'Environment', keywords: ['miljö', 'utsläpp', 'klimat', 'environment'] },
  { id: 'education', name_sv: 'Utbildning', name_en: 'Education', keywords: ['utbildning', 'skola', 'education'] },
  { id: 'health', name_sv: 'Hälsa', name_en: 'Health', keywords: ['hälsa', 'sjukvård', 'health'] },
];

// MCP Resources definitions
export const resources: Resource[] = [
  {
    uri: 'scb://regions/counties',
    name: 'Swedish Counties (Län)',
    description: 'List of all Swedish counties with their region codes',
    mimeType: 'application/json',
  },
  {
    uri: 'scb://regions/municipalities',
    name: 'Major Swedish Municipalities',
    description: 'List of major Swedish municipalities with their region codes',
    mimeType: 'application/json',
  },
  {
    uri: 'scb://tables/popular',
    name: 'Popular Tables',
    description: 'Commonly used SCB statistical tables',
    mimeType: 'application/json',
  },
  {
    uri: 'scb://categories',
    name: 'Search Categories',
    description: 'Available categories for filtering table searches',
    mimeType: 'application/json',
  },
  {
    uri: 'scb://guide/search-tips',
    name: 'Search Tips',
    description: 'Tips for effective searching in SCB database',
    mimeType: 'text/plain',
  },
];

// Get resource content by URI
export function getResourceContent(uri: string): { content: string; mimeType: string } | null {
  switch (uri) {
    case 'scb://regions/counties':
      return {
        content: JSON.stringify({
          description: 'Swedish counties (län) with 2-digit region codes',
          regions: commonRegions.filter(r => r.type === 'county'),
          usage: 'Use the "code" value in Region selections, e.g., {"Region": ["01"]} for Stockholm county'
        }, null, 2),
        mimeType: 'application/json'
      };

    case 'scb://regions/municipalities':
      return {
        content: JSON.stringify({
          description: 'Major Swedish municipalities (kommun) with 4-digit region codes',
          regions: commonRegions.filter(r => r.type === 'municipality'),
          usage: 'Use the "code" value in Region selections, e.g., {"Region": ["0180"]} for Stockholm municipality'
        }, null, 2),
        mimeType: 'application/json'
      };

    case 'scb://tables/popular':
      return {
        content: JSON.stringify({
          description: 'Commonly used SCB statistical tables',
          tables: popularTables,
          tip: 'Use scb_get_table_info with the table ID to see available variables'
        }, null, 2),
        mimeType: 'application/json'
      };

    case 'scb://categories':
      return {
        content: JSON.stringify({
          description: 'Available categories for filtering searches with scb_search_tables',
          categories: categories,
          usage: 'Use the "id" value as the category parameter, e.g., scb_search_tables(query="statistik", category="population")'
        }, null, 2),
        mimeType: 'application/json'
      };

    case 'scb://guide/search-tips':
      return {
        content: `# SCB Search Tips

## Language
- **Swedish search terms work best** - SCB is a Swedish agency
- Example: "befolkning" finds more results than "population"
- Use "kommun" for municipality, "län" for county

## Effective Searching
1. Start broad, then narrow down
2. Use category filters: population, labour, economy, housing, environment, education, health
3. Check variable names with scb_get_table_variables before fetching data

## Region Codes
- Country: "00" (Riket)
- Counties: 2 digits (e.g., "01" = Stockholm län)
- Municipalities: 4 digits (e.g., "0180" = Stockholm kommun)

## Data Selection Tips
- Use "*" to select all values
- Use "TOP(5)" for latest 5 time periods
- Always validate with scb_test_selection before fetching large datasets

## Recommended Workflow
1. scb_search_tables → Find table
2. scb_get_table_variables → See variables
3. scb_find_region_code → Get region code
4. scb_test_selection → Validate
5. scb_preview_data → Preview
6. scb_get_table_data → Full data
`,
        mimeType: 'text/plain'
      };

    default:
      return null;
  }
}
