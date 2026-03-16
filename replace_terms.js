const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, 'frontend/src/app');

// Re-ordered to prevent double replacing
const replacements = [
  { from: /CellularGraph/g, to: 'HierarchicalGraph' },
  { from: /cellularGraph/g, to: 'hierarchicalGraph' },
  { from: /Cellular/g, to: 'Hierarchical' },
  { from: /cellular/g, to: 'hierarchical' },

  { from: /AgentSwarm/g, to: 'AgentSystem' },
  { from: /agentSwarm/g, to: 'agentSystem' },
  { from: /agent_swarm/g, to: 'agent_system' },
  { from: /Swarm/g, to: 'System' },
  { from: /swarm/g, to: 'system' },

  { from: /ImmuneSwarm/g, to: 'SystemPatcher' },
  { from: /immuneSwarm/g, to: 'systemPatcher' },
  { from: /Immune/g, to: 'System' },
  { from: /immune/g, to: 'system' },

  { from: /Mutation/g, to: 'Patch' },
  { from: /mutation/g, to: 'patch' },
  { from: /Mutate/g, to: 'Patch' },
  { from: /mutate/g, to: 'patch' },
  { from: /Mutat/g, to: 'Patch' },   // catch 'Mutating'
  { from: /mutat/g, to: 'patch' },

  { from: /Organism/g, to: 'System' },
  { from: /organism/g, to: 'system' },

  { from: /Pathogen/g, to: 'Vulnerability' },
  { from: /pathogen/g, to: 'vulnerability' },

  { from: /tCell/g, to: 'patcher' },
  { from: /TCell/g, to: 'Patcher' },
  { from: /T-Cell/g, to: 'Patcher' },
  { from: /t_cell/g, to: 'patcher' },

  { from: /Metabolism/g, to: 'Performance' },
  { from: /metabolism/g, to: 'performance' },
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'components') {
          processDirectory(fullPath);
      } else {
          processDirectory(fullPath);
      }
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.css') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      for (const req of replacements) {
        if (content.match(req.from)) {
          content = content.replace(req.from, req.to);
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated', fullPath);
      }
    }
  }
}

processDirectory(dir);
console.log('Replacements complete in frontend/src/app.');
