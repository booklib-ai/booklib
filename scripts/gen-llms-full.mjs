import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const skillsRoot = './skills';
const outputFile = './llms-full.txt';

async function generateFullLLM() {
  const skills = fs.readdirSync(skillsRoot)
    .filter(name => fs.statSync(path.join(skillsRoot, name)).isDirectory() && fs.existsSync(path.join(skillsRoot, name, 'SKILL.md')));

  let output = '# BookLib Full Skill Catalog\n\nThis file contains detailed descriptions and triggers for every skill in the BookLib library, optimized for RAG retrieval.\n\n';

  for (const skill of skills) {
    const skillPath = path.join(skillsRoot, skill, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    const { data: frontmatter } = matter(content);

    output += `## Skill: ${frontmatter.name || skill}\n`;
    output += `**Description**: ${frontmatter.description || 'No description available.'}\n`;
    output += `**Directory**: \`skills/${skill}/\`\n`;
    
    // Extract triggers if available in frontmatter or first paragraph
    const triggerMatch = content.match(/Trigger on (.*)\./);
    if (triggerMatch) {
      output += `**Triggers**: ${triggerMatch[1]}\n`;
    }

    output += '\n---\n\n';
  }

  fs.writeFileSync(outputFile, output.trim());
  console.log(`Generated ${outputFile} with ${skills.length} skills.`);
}

generateFullLLM().catch(console.error);
