# 14 — GitHub, Slack & Notion Connectors

---

# GITHUB CONNECTOR

## Actions
```
GITHUB_LIST_REPOS         — List user's repositories
GITHUB_CREATE_ISSUE       — Create an issue
GITHUB_LIST_ISSUES        — List issues for a repo
GITHUB_GET_ISSUE          — Get single issue
GITHUB_LIST_PRS           — List pull requests
GITHUB_CREATE_COMMENT     — Comment on an issue or PR
GITHUB_GET_USER           — Get authenticated user info
```

## Base URL
```
https://api.github.com
Auth: Bearer token
Note: GitHub tokens don't expire — no refresh needed
```

## Full Implementation

```typescript
// connectors/github/src/index.ts

import { defineConnector, defineAction } from '@nexus/connector-sdk'

const listRepos = defineAction({
  name: 'LIST_REPOS',
  displayName: 'List Repositories',
  description: 'List the authenticated user\'s GitHub repositories',
  category: 'development',
  inputSchema: {
    type: 'object',
    properties: {
      sort: {
        type: 'string',
        description: 'Sort by: updated, created, pushed, full_name',
        enum: ['updated', 'created', 'pushed', 'full_name'],
      },
      maxResults: {
        type: 'number',
        description: 'Max repos to return (default: 20)',
      }
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: { repos: { type: 'array' } }
  },
  execute: async ({ token, args }) => {
    try {
      const params = new URLSearchParams({
        sort: (args.sort as string) ?? 'updated',
        per_page: String(Math.min(Number(args.maxResults ?? 20), 100)),
      })

      const response = await fetch(
        `https://api.github.com/user/repos?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          }
        }
      )

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `GITHUB_${response.status}`,
            message: `GitHub error: ${response.statusText}`,
            retryable: response.status >= 500,
          }
        }
      }

      const repos = await response.json()
      return {
        success: true,
        data: {
          repos: repos.map((r: any) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description,
            isPrivate: r.private,
            url: r.html_url,
            stars: r.stargazers_count,
            updatedAt: r.updated_at,
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

const createIssue = defineAction({
  name: 'CREATE_ISSUE',
  displayName: 'Create Issue',
  description: 'Create a new GitHub issue',
  category: 'development',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner (username or org)',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      title: {
        type: 'string',
        description: 'Issue title',
        maxLength: 256,
      },
      body: {
        type: 'string',
        description: 'Issue description (markdown supported)',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated label names',
      },
    },
    required: ['owner', 'repo', 'title'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      issueNumber: { type: 'number' },
      url: { type: 'string' },
      title: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const { owner, repo, title, body, labels } = args as any

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            body: body ?? '',
            labels: labels ? labels.split(',').map((l: string) => l.trim()) : [],
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `GITHUB_${response.status}`,
            message: error.message ?? 'Failed to create issue',
            retryable: response.status >= 500,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: {
          issueNumber: data.number,
          url: data.html_url,
          title: data.title,
          state: data.state,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

const listIssues = defineAction({
  name: 'LIST_ISSUES',
  displayName: 'List Issues',
  description: 'List issues for a GitHub repository',
  category: 'development',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      state: {
        type: 'string',
        description: 'Issue state: open, closed, all',
        enum: ['open', 'closed', 'all'],
      },
      maxResults: { type: 'number', description: 'Max issues (default: 20)' },
    },
    required: ['owner', 'repo'],
  },
  outputSchema: {
    type: 'object',
    properties: { issues: { type: 'array' } }
  },
  execute: async ({ token, args }) => {
    try {
      const params = new URLSearchParams({
        state: (args.state as string) ?? 'open',
        per_page: String(Math.min(Number(args.maxResults ?? 20), 100)),
      })

      const response = await fetch(
        `https://api.github.com/repos/${args.owner}/${args.repo}/issues?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          }
        }
      )

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `GITHUB_${response.status}`,
            message: `GitHub error: ${response.statusText}`,
            retryable: response.status >= 500,
          }
        }
      }

      const issues = await response.json()
      return {
        success: true,
        data: {
          issues: issues
            .filter((i: any) => !i.pull_request) // exclude PRs from issues
            .map((i: any) => ({
              number: i.number,
              title: i.title,
              body: i.body,
              state: i.state,
              url: i.html_url,
              labels: i.labels.map((l: any) => l.name),
              createdAt: i.created_at,
              updatedAt: i.updated_at,
              author: i.user.login,
            }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

const createComment = defineAction({
  name: 'CREATE_COMMENT',
  displayName: 'Create Comment',
  description: 'Add a comment to a GitHub issue or pull request',
  category: 'development',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      issueNumber: { type: 'number', description: 'Issue or PR number' },
      body: { type: 'string', description: 'Comment text (markdown supported)' },
    },
    required: ['owner', 'repo', 'issueNumber', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      commentId: { type: 'number' },
      url: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: args.body }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `GITHUB_${response.status}`,
            message: error.message ?? 'Failed to create comment',
            retryable: response.status >= 500,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: { commentId: data.id, url: data.html_url }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

export const githubConnector = defineConnector({
  name: 'github',
  displayName: 'GitHub',
  description: 'Manage repositories, issues, and pull requests',
  version: '1.0.0',
  authType: 'OAUTH2',
  logoUrl: '/logos/github.svg',
  actions: [listRepos, createIssue, listIssues, createComment],
})
```

---

# SLACK CONNECTOR

## Actions
```
SLACK_SEND_MESSAGE      — Send a message to a channel
SLACK_LIST_CHANNELS     — List available channels
SLACK_GET_MESSAGES      — Get recent messages from a channel
SLACK_SEND_DM           — Send a direct message to a user
```

## Implementation

```typescript
// connectors/slack/src/index.ts

import { defineConnector, defineAction } from '@nexus/connector-sdk'

const sendMessage = defineAction({
  name: 'SEND_MESSAGE',
  displayName: 'Send Message',
  description: 'Send a message to a Slack channel',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Channel name (e.g., #general) or channel ID',
      },
      text: {
        type: 'string',
        description: 'Message text. Supports Slack markdown.',
        maxLength: 4000,
      },
    },
    required: ['channel', 'text'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ts: { type: 'string', description: 'Message timestamp (Slack message ID)' },
      channel: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: args.channel,
          text: args.text,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        return {
          success: false,
          error: {
            code: `SLACK_${data.error?.toUpperCase()}`,
            message: data.error ?? 'Failed to send message',
            retryable: data.error === 'ratelimited',
          }
        }
      }

      return {
        success: true,
        data: { ts: data.ts, channel: data.channel }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

const listChannels = defineAction({
  name: 'LIST_CHANNELS',
  displayName: 'List Channels',
  description: 'List available Slack channels',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: { type: 'number', description: 'Max channels (default: 50)' }
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: { channels: { type: 'array' } }
  },
  execute: async ({ token, args }) => {
    try {
      const params = new URLSearchParams({
        limit: String(Math.min(Number(args.maxResults ?? 50), 200)),
        exclude_archived: 'true',
      })

      const response = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const data = await response.json()

      if (!data.ok) {
        return {
          success: false,
          error: {
            code: `SLACK_${data.error?.toUpperCase()}`,
            message: data.error ?? 'Failed to list channels',
            retryable: false,
          }
        }
      }

      return {
        success: true,
        data: {
          channels: data.channels.map((c: any) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.is_private,
            memberCount: c.num_members,
            topic: c.topic?.value,
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

export const slackConnector = defineConnector({
  name: 'slack',
  displayName: 'Slack',
  description: 'Send messages and manage Slack channels',
  version: '1.0.0',
  authType: 'OAUTH2',
  logoUrl: '/logos/slack.svg',
  actions: [sendMessage, listChannels],
})
```

---

# NOTION CONNECTOR

## Actions
```
NOTION_CREATE_PAGE      — Create a new page in a database or as subpage
NOTION_SEARCH_PAGES     — Search pages and databases
NOTION_GET_PAGE         — Get a page's content
NOTION_UPDATE_PAGE      — Update a page's properties
```

## Implementation

```typescript
// connectors/notion/src/index.ts

import { defineConnector, defineAction } from '@nexus/connector-sdk'

const NOTION_VERSION = '2022-06-28'

const searchPages = defineAction({
  name: 'SEARCH_PAGES',
  displayName: 'Search Pages',
  description: 'Search Notion pages and databases',
  category: 'productivity',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      maxResults: {
        type: 'number',
        description: 'Max results (default: 10)',
      }
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: { pages: { type: 'array' } }
  },
  execute: async ({ token, args }) => {
    try {
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: args.query ?? '',
          page_size: Math.min(Number(args.maxResults ?? 10), 100),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `NOTION_${response.status}`,
            message: error.message ?? 'Search failed',
            retryable: response.status >= 500,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: {
          pages: data.results.map((r: any) => ({
            id: r.id,
            title: extractNotionTitle(r),
            type: r.object,
            url: r.url,
            createdAt: r.created_time,
            updatedAt: r.last_edited_time,
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

const createPage = defineAction({
  name: 'CREATE_PAGE',
  displayName: 'Create Page',
  description: 'Create a new Notion page',
  category: 'productivity',
  inputSchema: {
    type: 'object',
    properties: {
      parentPageId: {
        type: 'string',
        description: 'ID of the parent page or database to create this page in',
      },
      title: {
        type: 'string',
        description: 'Page title',
        maxLength: 500,
      },
      content: {
        type: 'string',
        description: 'Page content as plain text',
      },
    },
    required: ['parentPageId', 'title'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      pageId: { type: 'string' },
      url: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const blocks = args.content
        ? (args.content as string).split('\n\n').filter(Boolean).map((para: string) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: para.slice(0, 2000) } }]
            }
          }))
        : []

      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { page_id: args.parentPageId },
          properties: {
            title: {
              title: [{ type: 'text', text: { content: args.title } }]
            }
          },
          children: blocks,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `NOTION_${response.status}`,
            message: error.message ?? 'Failed to create page',
            retryable: response.status >= 500,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: { pageId: data.id, url: data.url }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

function extractNotionTitle(page: any): string {
  try {
    if (page.properties?.title?.title?.[0]?.plain_text) {
      return page.properties.title.title[0].plain_text
    }
    if (page.properties?.Name?.title?.[0]?.plain_text) {
      return page.properties.Name.title[0].plain_text
    }
    return 'Untitled'
  } catch {
    return 'Untitled'
  }
}

export const notionConnector = defineConnector({
  name: 'notion',
  displayName: 'Notion',
  description: 'Create and manage Notion pages and databases',
  version: '1.0.0',
  authType: 'OAUTH2',
  logoUrl: '/logos/notion.svg',
  actions: [searchPages, createPage],
})
```

---

## GitHub Test Checklist
```
□ List repos → returns your repos with name/url/stars
□ Create issue in a repo → issue appears on GitHub
□ List issues → returns open issues
□ Create comment on issue → comment appears
□ Invalid repo → returns error with retryable: false
□ Rate limit hit → returns retryable: true
```

## Slack Test Checklist
```
□ List channels → returns workspace channels
□ Send message to #general → message appears in Slack
□ Invalid channel → returns SLACK_CHANNEL_NOT_FOUND error
□ Rate limited → returns retryable: true
```

## Notion Test Checklist
```
□ Search pages → returns matching pages
□ Create page → page appears in Notion
□ Invalid parent ID → returns NOTION_404 error
□ Content with multiple paragraphs → all blocks created
```
