import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  parsePackageJson,
  parseRequirementsTxt,
  parsePyprojectToml,
  parsePomXml,
  parseBuildGradle,
  parseCargoToml,
  parseGemfile,
  parseGoMod,
  parseCsproj,
  parseComposerJson,
  scanDependencies,
} from '../../lib/engine/registries.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registries-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('parsePackageJson', () => {
  it('extracts dependencies and devDependencies', () => {
    const fp = writeFile('package.json', JSON.stringify({
      dependencies: { express: '^4.18.2', lodash: '~4.17.21' },
      devDependencies: { jest: '^29.7.0' },
    }));
    const deps = parsePackageJson(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'npm'));

    const express = deps.find(d => d.name === 'express');
    assert.equal(express.version, '4.18.2');

    const jest = deps.find(d => d.name === 'jest');
    assert.equal(jest.version, '29.7.0');
  });
});

describe('parseRequirementsTxt', () => {
  it('handles name==version format', () => {
    const fp = writeFile('requirements.txt', 'flask==2.3.2\nrequests>=2.31.0\nnumpy~=1.25.0\n');
    const deps = parseRequirementsTxt(fp);
    assert.equal(deps.length, 3);

    const flask = deps.find(d => d.name === 'flask');
    assert.equal(flask.version, '2.3.2');
    assert.equal(flask.ecosystem, 'pypi');
  });

  it('skips comments and blank lines', () => {
    const fp = writeFile('requirements.txt', [
      '# This is a comment',
      '',
      'flask==2.3.2',
      '  # another comment',
      '-r other.txt',
      'requests>=2.31.0',
      '',
    ].join('\n'));
    const deps = parseRequirementsTxt(fp);
    assert.equal(deps.length, 2);
    assert.equal(deps[0].name, 'flask');
    assert.equal(deps[1].name, 'requests');
  });
});

describe('parsePyprojectToml', () => {
  it('extracts from [project] dependencies', () => {
    const fp = writeFile('pyproject.toml', `
[project]
name = "myapp"
dependencies = [
  "fastapi>=0.100.0",
  "pydantic>=2.0",
  "uvicorn",
]
`);
    const deps = parsePyprojectToml(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'pypi'));

    const fastapi = deps.find(d => d.name === 'fastapi');
    assert.equal(fastapi.version, '0.100.0');

    const uvicorn = deps.find(d => d.name === 'uvicorn');
    assert.equal(uvicorn.version, 'latest');
  });
});

describe('parsePomXml', () => {
  it('extracts groupId:artifactId with version', () => {
    const fp = writeFile('pom.xml', `
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>6.0.11</version>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
    </dependency>
  </dependencies>
</project>
`);
    const deps = parsePomXml(fp);
    assert.equal(deps.length, 2);

    const spring = deps.find(d => d.name === 'org.springframework:spring-core');
    assert.equal(spring.version, '6.0.11');
    assert.equal(spring.ecosystem, 'maven');
  });
});

describe('parseBuildGradle', () => {
  it('extracts implementation dependencies', () => {
    const fp = writeFile('build.gradle', `
plugins {
    id 'java'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter:3.1.0'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'
    api 'com.google.guava:guava:32.1.2-jre'
}
`);
    const deps = parseBuildGradle(fp);
    assert.equal(deps.length, 3);

    const boot = deps.find(d => d.name === 'org.springframework.boot:spring-boot-starter');
    assert.equal(boot.version, '3.1.0');
    assert.equal(boot.ecosystem, 'maven');
  });
});

describe('parseCargoToml', () => {
  it('extracts [dependencies] section', () => {
    const fp = writeFile('Cargo.toml', `
[package]
name = "myapp"

[dependencies]
serde = "1.0.188"
tokio = { version = "1.32.0", features = ["full"] }
reqwest = "^0.11.20"
`);
    const deps = parseCargoToml(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'crates'));

    const serde = deps.find(d => d.name === 'serde');
    assert.equal(serde.version, '1.0.188');

    const tokio = deps.find(d => d.name === 'tokio');
    assert.equal(tokio.version, '1.32.0');

    const reqwest = deps.find(d => d.name === 'reqwest');
    assert.equal(reqwest.version, '0.11.20');
  });
});

describe('parseGemfile', () => {
  it('extracts gem name and version', () => {
    const fp = writeFile('Gemfile', `
source 'https://rubygems.org'

gem 'rails', '~> 7.0.8'
gem 'puma', '>= 5.0'
gem 'sqlite3'
`);
    const deps = parseGemfile(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'rubygems'));

    const rails = deps.find(d => d.name === 'rails');
    assert.equal(rails.version, '7.0.8');

    const sqlite = deps.find(d => d.name === 'sqlite3');
    assert.equal(sqlite.version, 'latest');
  });
});

describe('parseGoMod', () => {
  it('extracts require block', () => {
    const fp = writeFile('go.mod', `
module example.com/myapp

go 1.21

require (
\tgithub.com/gin-gonic/gin v1.9.1
\tgithub.com/stretchr/testify v1.8.4
)

require github.com/joho/godotenv v1.5.1
`);
    const deps = parseGoMod(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'go'));

    const gin = deps.find(d => d.name === 'github.com/gin-gonic/gin');
    assert.equal(gin.version, 'v1.9.1');

    const godotenv = deps.find(d => d.name === 'github.com/joho/godotenv');
    assert.equal(godotenv.version, 'v1.5.1');
  });
});

describe('parseCsproj', () => {
  it('extracts PackageReference elements', () => {
    const fp = writeFile('MyApp.csproj', `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Microsoft.Extensions.Logging" Version="7.0.0" />
  </ItemGroup>
</Project>
`);
    const deps = parseCsproj(fp);
    assert.equal(deps.length, 2);
    assert.ok(deps.every(d => d.ecosystem === 'nuget'));

    const newtonsoft = deps.find(d => d.name === 'Newtonsoft.Json');
    assert.equal(newtonsoft.version, '13.0.3');
  });
});

describe('parseComposerJson', () => {
  it('extracts require deps, skips php and ext-', () => {
    const fp = writeFile('composer.json', JSON.stringify({
      require: {
        'php': '>=8.1',
        'ext-json': '*',
        'laravel/framework': '^10.0',
        'guzzlehttp/guzzle': '^7.8',
      },
      'require-dev': {
        'phpunit/phpunit': '^10.3',
      },
    }));
    const deps = parseComposerJson(fp);
    assert.equal(deps.length, 3);
    assert.ok(deps.every(d => d.ecosystem === 'packagist'));
    assert.ok(!deps.some(d => d.name === 'php'));
    assert.ok(!deps.some(d => d.name === 'ext-json'));

    const laravel = deps.find(d => d.name === 'laravel/framework');
    assert.equal(laravel.version, '10.0');
  });
});

describe('scanDependencies', () => {
  it('detects ecosystem from project files', () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { express: '^4.18.2' },
    }));
    writeFile('requirements.txt', 'flask==2.3.2\n');

    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 2);

    const ecosystems = [...new Set(deps.map(d => d.ecosystem))];
    assert.ok(ecosystems.includes('npm'));
    assert.ok(ecosystems.includes('pypi'));
  });

  it('picks up .csproj files with variable names', () => {
    writeFile('MyApp.csproj', `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>
`);
    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].ecosystem, 'nuget');
  });

  it('returns empty array for directory with no dependency files', () => {
    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 0);
  });

  it('finds dependency files in subdirectories', () => {
    fs.mkdirSync(path.join(tmpDir, 'frontend'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'frontend', 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } })
    );
    fs.mkdirSync(path.join(tmpDir, 'scraper'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'scraper', 'requirements.txt'),
      'scrapy==2.11.0\n'
    );

    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 2);
    assert.ok(deps.some(d => d.name === 'react' && d.ecosystem === 'npm'));
    assert.ok(deps.some(d => d.name === 'scrapy' && d.ecosystem === 'pypi'));
  });

  it('deduplicates deps from root and subdirectory', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.18.2' } })
    );
    fs.mkdirSync(path.join(tmpDir, 'services', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'services', 'api', 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.19.0', cors: '^2.8.5' } })
    );

    const deps = scanDependencies(tmpDir);
    const expressDeps = deps.filter(d => d.name === 'express');
    assert.equal(expressDeps.length, 1, 'express should appear only once');
    assert.equal(expressDeps[0].version, '4.18.2', 'root version should win');
    assert.ok(deps.some(d => d.name === 'cors'), 'unique subdirectory dep should be included');
  });

  it('skips node_modules and other excluded dirs', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'express'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'node_modules', 'express', 'package.json'),
      JSON.stringify({ dependencies: { 'body-parser': '^1.0.0' } })
    );
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'dist', 'package.json'),
      JSON.stringify({ dependencies: { leftpad: '^1.0.0' } })
    );

    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 0, 'should not find deps inside excluded dirs');
  });

  it('does not scan beyond depth 3', () => {
    // depth 4: root/a/b/c/d/package.json
    const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(
      path.join(deepDir, 'package.json'),
      JSON.stringify({ dependencies: { 'too-deep': '^1.0.0' } })
    );
    // depth 3: root/a/b/c/package.json (should be found)
    fs.writeFileSync(
      path.join(tmpDir, 'a', 'b', 'c', 'package.json'),
      JSON.stringify({ dependencies: { 'just-right': '^1.0.0' } })
    );

    const deps = scanDependencies(tmpDir);
    assert.ok(deps.some(d => d.name === 'just-right'), 'depth 3 should be found');
    assert.ok(!deps.some(d => d.name === 'too-deep'), 'depth 4 should be skipped');
  });

  it('finds .csproj files in subdirectories', () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'WebApi'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'WebApi', 'WebApi.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk">
      <ItemGroup>
        <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
      </ItemGroup>
    </Project>`
    );

    const deps = scanDependencies(tmpDir);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].name, 'Newtonsoft.Json');
    assert.equal(deps[0].ecosystem, 'nuget');
  });

  it('caps manifest file discovery at 20', () => {
    // Create 25 subdirs each with a package.json
    for (let i = 0; i < 25; i++) {
      const dir = path.join(tmpDir, `pkg-${String(i).padStart(2, '0')}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { [`dep-${i}`]: '1.0.0' } })
      );
    }

    const deps = scanDependencies(tmpDir);
    // Each manifest has 1 dep, capped at 20 manifests
    assert.ok(deps.length <= 20, `should find at most 20 deps, found ${deps.length}`);
  });
});
