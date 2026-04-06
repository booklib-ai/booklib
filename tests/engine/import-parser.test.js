import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseImports, detectLanguage, extractPackageName } from '../../lib/engine/import-parser.js';

describe('detectLanguage', () => {
  it('maps JS/TS extensions', () => {
    assert.equal(detectLanguage('app.js'), 'js');
    assert.equal(detectLanguage('app.ts'), 'js');
    assert.equal(detectLanguage('app.tsx'), 'js');
    assert.equal(detectLanguage('app.mjs'), 'js');
    assert.equal(detectLanguage('app.cjs'), 'js');
    assert.equal(detectLanguage('app.jsx'), 'js');
  });

  it('maps Python extensions', () => {
    assert.equal(detectLanguage('main.py'), 'python');
    assert.equal(detectLanguage('gui.pyw'), 'python');
  });

  it('maps Go, Rust, Java, Kotlin, Ruby, PHP, C#, Swift, Dart', () => {
    assert.equal(detectLanguage('main.go'), 'go');
    assert.equal(detectLanguage('lib.rs'), 'rust');
    assert.equal(detectLanguage('App.java'), 'java');
    assert.equal(detectLanguage('App.kt'), 'kotlin');
    assert.equal(detectLanguage('app.rb'), 'ruby');
    assert.equal(detectLanguage('index.php'), 'php');
    assert.equal(detectLanguage('Program.cs'), 'csharp');
    assert.equal(detectLanguage('App.swift'), 'swift');
    assert.equal(detectLanguage('main.dart'), 'dart');
  });

  it('returns null for unknown extensions', () => {
    assert.equal(detectLanguage('Makefile'), null);
    assert.equal(detectLanguage('style.css'), null);
  });
});

describe('extractPackageName', () => {
  it('handles JS scoped packages', () => {
    assert.equal(extractPackageName('@scope/pkg/foo/bar', 'js'), '@scope/pkg');
    assert.equal(extractPackageName('@tanstack/react-query', 'js'), '@tanstack/react-query');
  });

  it('handles JS unscoped packages', () => {
    assert.equal(extractPackageName('react/jsx-runtime', 'js'), 'react');
    assert.equal(extractPackageName('lodash', 'js'), 'lodash');
  });

  it('handles Go github imports', () => {
    assert.equal(
      extractPackageName('github.com/gin-gonic/gin/middleware', 'go'),
      'github.com/gin-gonic/gin',
    );
  });

  it('handles Java package segments', () => {
    assert.equal(extractPackageName('com.google.gson.Gson', 'java'), 'com.google.gson');
    assert.equal(
      extractPackageName('org.springframework.boot.autoconfigure', 'java'),
      'org.springframework.boot',
    );
  });

  it('handles Kotlin same as Java', () => {
    assert.equal(extractPackageName('io.ktor.server.application', 'kotlin'), 'io.ktor.server');
  });

  it('passes through for other languages', () => {
    assert.equal(extractPackageName('flask', 'python'), 'flask');
    assert.equal(extractPackageName('serde', 'rust'), 'serde');
  });
});

describe('parseImports — JS/TS', () => {
  it('parses ES import from', () => {
    const code = `import React from 'react';\nimport { useState } from 'react';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'react');
  });

  it('parses require()', () => {
    const code = `const express = require('express');`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'express');
  });

  it('parses dynamic import()', () => {
    const code = `const mod = await import('lodash');`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'lodash');
  });

  it('handles scoped packages', () => {
    const code = `import { QueryClient } from '@tanstack/react-query/core';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, '@tanstack/react-query');
  });

  it('skips relative imports', () => {
    const code = `import foo from './foo';\nimport bar from '../bar';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 0);
  });

  it('deduplicates same package from different patterns', () => {
    const code = `import React from 'react';\nconst React2 = require('react');`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
  });

  it('parses import type { X } from statement', () => {
    const code = `import type { Config } from 'vite';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'vite');
  });

  it('parses import { type X, Y } from statement', () => {
    const code = `import { type Config, defineConfig } from 'vite';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'vite');
  });

  it('parses import type X from statement', () => {
    const code = `import type React from 'react';`;
    const result = parseImports(code, 'js');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'react');
  });
});

describe('parseImports — Python', () => {
  it('parses import statement', () => {
    const code = `import flask`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'flask');
  });

  it('parses from import statement', () => {
    const code = `from django import views`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'django');
  });

  it('skips relative import: from . import foo', () => {
    const code = `from . import foo`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 0);
  });

  it('skips relative import: from .. import bar', () => {
    const code = `from .. import bar`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 0);
  });

  it('skips relative import: from .module import baz', () => {
    const code = `from .module import baz`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 0);
  });

  it('skips relative import: from ..utils import helper', () => {
    const code = `from ..utils import helper`;
    const result = parseImports(code, 'python');
    assert.equal(result.length, 0);
  });
});

describe('parseImports — Go', () => {
  it('parses Go import with github path', () => {
    const code = `import "github.com/gin-gonic/gin"`;
    const result = parseImports(code, 'go');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'github.com/gin-gonic/gin');
  });
});

describe('parseImports — Rust', () => {
  it('parses use statement', () => {
    const code = `use serde::Serialize;`;
    const result = parseImports(code, 'rust');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'serde');
  });

  it('parses extern crate', () => {
    const code = `extern crate tokio;`;
    const result = parseImports(code, 'rust');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'tokio');
  });
});

describe('parseImports — Java', () => {
  it('parses Java import', () => {
    const code = `import com.google.gson.Gson;`;
    const result = parseImports(code, 'java');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'com.google.gson');
  });
});

describe('parseImports — Ruby', () => {
  it('parses require', () => {
    const code = `require 'rails'`;
    const result = parseImports(code, 'ruby');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'rails');
  });
});

describe('parseImports — PHP', () => {
  it('parses use statement', () => {
    const code = `use Illuminate\\Support\\Facades\\DB;`;
    const result = parseImports(code, 'php');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'Illuminate');
  });
});

describe('parseImports — C#', () => {
  it('parses using statement', () => {
    const code = `using System.Linq;`;
    const result = parseImports(code, 'csharp');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'System.Linq');
  });
});

describe('parseImports — Swift', () => {
  it('parses import statement', () => {
    const code = `import SwiftUI`;
    const result = parseImports(code, 'swift');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'SwiftUI');
  });
});

describe('parseImports — Dart', () => {
  it('parses package import', () => {
    const code = `import 'package:flutter/material.dart';`;
    const result = parseImports(code, 'dart');
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'flutter');
  });
});

describe('parseImports — unsupported language', () => {
  it('returns empty for unknown language', () => {
    const result = parseImports('some code', 'brainfuck');
    assert.deepEqual(result, []);
  });
});
