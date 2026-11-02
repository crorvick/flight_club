# Building a Web App, Start to Finish

### A hands-on guide to modern web development with Node.js, Next.js, PostgreSQL and object storage, told through one real application

This book walks you through building **Flight Club**: a web app that a
small flying club uses to check aircraft out and in, log flights, report
problems ("squawks") with photos, track maintenance, and keep pilots'
qualifications current. The app in this repository is the finished
product. The book explains how to build it, and more importantly _why_
it's built the way it is.

You're assumed to be comfortable with programming and computers in
general: you've written code in some language, used a terminal, and know
roughly what a database is. You're new to how the modern web fits
together. By the end you should be able to build, test, deploy and run
a production web application, and understand each layer well enough to
debug it when it misbehaves.

## Contents

| Part                  | Chapter                                                                        | What you'll learn                                                                          |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
|                       | [Preface](00-preface.md)                                                       | Who this book is for, how it's organized, conventions                                      |
| **I. Foundations**    | [1. How the Web Actually Works](01-how-the-web-works.md)                       | HTTP, browsers and servers, HTML/CSS/JS, cookies, statelessness                            |
|                       | [2. The Toolchain](02-the-toolchain.md)                                        | Node.js, TypeScript, pnpm, a project skeleton, linting and formatting                      |
|                       | [3. Pages, Components and Routes](03-pages-components-and-routes.md)           | React, JSX, the Next.js App Router, layouts, Server Components, Tailwind                   |
| **II. Data**          | [4. Thinking in Tables](04-thinking-in-tables.md)                              | Relational modeling, PostgreSQL, keys and constraints, Docker Compose                      |
|                       | [5. Talking to the Database](05-talking-to-the-database.md)                    | Drizzle ORM, migrations, queries, transactions, locking, seed data                         |
|                       | [6. Forms and Server Actions](06-forms-and-server-actions.md)                  | FormData, validation with Zod, Server Actions, redirects, errors                           |
| **III. People**       | [7. Who Are You, and What May You Do?](07-authentication-and-authorization.md) | Passwords, sessions, cookies, Better Auth, roles, audit logs                               |
|                       | [8. Rules Without Frameworks](08-rules-without-frameworks.md)                  | Pure domain logic, derived state, money-safe arithmetic, Vitest                            |
| **IV. The Interface** | [9. Interactive Interfaces](09-interactive-interfaces.md)                      | Client Components, hydration, state, accessible UI, responsive and print design, dark mode |
|                       | [10. Files and Object Storage](10-files-and-object-storage.md)                 | Why not the disk, S3 and its compatibles, uploads, private downloads                       |
|                       | [11. Rendering, Streaming and Caching](11-rendering-streaming-and-caching.md)  | Prerendering, Suspense, streaming, what to cache and what never to                         |
| **V. Shipping**       | [12. Testing It Like a User](12-testing-it-like-a-user.md)                     | Playwright, multiple devices, test isolation                                               |
|                       | [13. Containers and Configuration](13-containers-and-configuration.md)         | Docker images, multi-stage builds, environment variables, health checks                    |
|                       | [14. Continuous Delivery](14-continuous-delivery.md)                           | GitHub Actions, build once and promote, staging and production, rollbacks                  |
|                       | [15. Living With It](15-living-with-it.md)                                     | Evolving schemas safely, backups and restores, release notes, what's next                  |
|                       | [Appendix A. Glossary](appendix-a-glossary.md)                                 | Terms in one place                                                                         |

Read the chapters in order the first time. Each one builds on the
vocabulary and code of the ones before it.
