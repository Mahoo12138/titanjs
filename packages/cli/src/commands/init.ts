/**
 * @neo-hexo/cli — init command
 *
 * Scaffolds a new Neo-Hexo project.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';

const DEFAULT_CONFIG = `# Neo-Hexo Configuration
# Docs: https://neo-hexo.io/docs/configuration

title: My Neo-Hexo Site
subtitle: ''
description: ''
author: ''
language: en
timezone: ''

url: http://localhost
root: /

# Directories
sourceDir: source
publicDir: public

# Build
permalink: ':year/:month/:day/:title/'
defaultLayout: post
titlecase: false

# Plugins (use shorthand names for built-in plugins)
plugins:
  - renderer-markdown
  - processor
  - generator
  - filter
  - helper
  - injector
  - console

# Theme
theme: {}
`;

const DEFAULT_POST = `---
title: Hello World
date: {{date}}
tags:
  - getting-started
---

Welcome to [Neo-Hexo](https://neo-hexo.io/)!

This is your very first post. Check the [documentation](https://neo-hexo.io/docs/) for more info.

<!-- more -->

## Quick Start

Create a new post:

\`\`\`bash
neo-hexo new post "My New Post"
\`\`\`

Generate static files:

\`\`\`bash
neo-hexo generate
\`\`\`

Deploy to remote site:

\`\`\`bash
neo-hexo deploy
\`\`\`
`;

const DEFAULT_SCAFFOLD_POST = `---
title: {{ title }}
date: {{ date }}
tags:
---
`;

const DEFAULT_SCAFFOLD_PAGE = `---
title: {{ title }}
date: {{ date }}
---
`;

const DEFAULT_SCAFFOLD_DRAFT = `---
title: {{ title }}
tags:
---
`;

/**
 * Initialize a new Neo-Hexo project in the given directory.
 */
export async function initProject(dir: string): Promise<void> {
  const baseDir = nodePath.resolve(dir);

  console.log('Initializing Neo-Hexo project in %s', baseDir);

  // Create directory structure
  const dirs = [
    '',
    'source',
    'source/_posts',
    'source/_drafts',
    'source/_data',
    'public',
    'scaffolds',
  ];

  for (const d of dirs) {
    await fs.mkdir(nodePath.join(baseDir, d), { recursive: true });
  }

  // Write config file
  const configPath = nodePath.join(baseDir, 'neo-hexo.yaml');
  await writeIfNotExists(configPath, DEFAULT_CONFIG);

  // Write default post
  const postContent = DEFAULT_POST.replace('{{date}}', new Date().toISOString());
  await writeIfNotExists(
    nodePath.join(baseDir, 'source/_posts/hello-world.md'),
    postContent,
  );

  // Write scaffolds
  await writeIfNotExists(
    nodePath.join(baseDir, 'scaffolds/post.md'),
    DEFAULT_SCAFFOLD_POST,
  );
  await writeIfNotExists(
    nodePath.join(baseDir, 'scaffolds/page.md'),
    DEFAULT_SCAFFOLD_PAGE,
  );
  await writeIfNotExists(
    nodePath.join(baseDir, 'scaffolds/draft.md'),
    DEFAULT_SCAFFOLD_DRAFT,
  );

  // Write .gitignore
  await writeIfNotExists(
    nodePath.join(baseDir, '.gitignore'),
    'public/\nnode_modules/\ndb.json\n*.log\n',
  );

  // Write package.json
  const pkg = {
    name: nodePath.basename(baseDir),
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'neo-hexo generate',
      clean: 'neo-hexo clean',
      deploy: 'neo-hexo deploy',
    },
    dependencies: {
      'neo-hexo': '^0.0.1',
    },
  };
  await writeIfNotExists(
    nodePath.join(baseDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
  );

  console.log('');
  console.log('Project created! Next steps:');
  console.log('  cd %s', dir === '.' ? '.' : dir);
  console.log('  npm install');
  console.log('  neo-hexo generate');
  console.log('');
}

async function writeIfNotExists(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
    // File exists, skip
  } catch {
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
