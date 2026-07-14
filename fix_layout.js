const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Wrap the left column
content = content.replace(
  '{/* Left Column: Habits list */}\n            <section className={styles.habitsSection}>',
  '{/* Left Column: Habits list & Secondary Grid */}\n            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>\n              <section className={styles.habitsSection}>'
);

// 2. Extract secondaryGrid
const secGridStart = content.indexOf('<section className={styles.secondaryGrid}>');
// find the end of secondaryGrid
const secGridEndStr = '              )}\n          </section>';
const secGridEnd = content.indexOf(secGridEndStr);

if (secGridStart === -1 || secGridEnd === -1) {
  console.log('Could not find secondaryGrid bounds', secGridStart, secGridEnd);
  process.exit(1);
}

// include the closing </section>
const secGridBlock = content.substring(secGridStart, secGridEnd + secGridEndStr.length); 

// Remove it from the bottom (also remove the extra spaces/newlines around it)
content = content.replace(secGridBlock, '');

// 3. Inject it before Right Column
const injectionTarget = '            {/* Right Column: Create Commitment Form */}';
const injection = `
              ${secGridBlock}
            </div>

${injectionTarget}`;

content = content.replace(injectionTarget, injection);

fs.writeFileSync('src/app/page.tsx', content);
console.log('Layout fixed successfully!');
