# Preface

There has never been more written about building web applications, and
it has never been harder to know where to start. A newcomer searching
for "how to build a web app" meets a wall of frameworks, hosting
platforms, databases, and opinions, most of it written for people who
already know the parts it leaves out. Tutorials tend to stop at the
point where an app runs on your laptop; the hard and interesting parts
(who's allowed to do what, what happens when two people click at once,
how the thing gets to production and stays there) are left as an
exercise.

This book takes a different approach. It follows one application, small
enough to understand completely and real enough to have real problems,
from an empty directory to production. Every technique in it is used
because the application needed it, not because it's fashionable.

## Who This Book Is For

You'll get the most from this book if:

- You can program. Any language will do; if you've written Python,
  Java, Go or C, you'll be fine. We'll introduce JavaScript and
  TypeScript as we go, focusing on where they differ from what you
  probably know.
- You're comfortable at a command line: running commands, setting
  environment variables, editing files.
- You've heard of HTTP, HTML and SQL, even if you couldn't explain them
  in depth.

You don't need any prior experience with React, Node.js, or web
frameworks. If you have some, you'll still find the later chapters on
data integrity, authorization, testing, and delivery worth your time:
that's where most real-world web apps go wrong.

## Why This Application?

A flying club is a good teacher. Its members share a handful of
expensive aircraft, so the app has to get several things exactly right:

- **Money and time.** Members are billed by the hour, read off meters
  in the cockpit. A rounding error is a billing error.
- **Safety.** An aircraft with an unresolved problem must not be flown.
  The app has to know, at every moment, whether each aircraft is
  airworthy, and it must never disagree with its own records.
- **Concurrency.** Two pilots may try to take the same aircraft at the
  same time. Exactly one of them should succeed.
- **Permissions.** Pilots, officers, and "plane captains" (members who
  look after particular aircraft) may each do different things.
- **Phones.** Most use happens on a phone on the ramp, often with a
  weak signal and gloves on. A failed submit must not lose what was
  typed.
- **Photos.** A picture of a cracked fairing is worth a paragraph, and
  photos don't belong in a database.

Every one of those is a problem you'll meet in any serious application,
whether it handles invoices, patient records or shipping containers.

## The Stack

We'll use the following, and explain each choice when we reach it:

| Concern                | Choice                                                 |
| ---------------------- | ------------------------------------------------------ |
| Language               | TypeScript, on Node.js                                 |
| Web framework          | Next.js (App Router) with React                        |
| Database               | PostgreSQL                                             |
| Database access        | Drizzle ORM and drizzle-kit migrations                 |
| Validation             | Zod                                                    |
| Accounts and sessions  | Better Auth                                            |
| Styling and components | Tailwind CSS and shadcn/ui                             |
| File storage           | Any S3-compatible bucket (Cloudflare R2 in production) |
| Tests                  | Vitest (unit) and Playwright (end-to-end)              |
| Packaging              | Docker                                                 |
| Delivery               | GitHub Actions and Render                              |

None of these are the only reasonable choice. Where an alternative is
common, a sidebar says what it is and when you might prefer it. The
ideas transfer: once you understand why a Server Action validates its
input and locks rows in a transaction, you'll recognize the same need in
Django, Rails, Phoenix or Spring.

> [!NOTE]
> Web frameworks change quickly. This book uses Next.js 16, which differs
> in places from older versions you may find described online (for
> example, "middleware" is now called "proxy", and request data such as
> `params` is accessed asynchronously). When something you read elsewhere
> doesn't match, check the documentation bundled with the installed
> version, in `node_modules/next/dist/docs/`.

## How This Book Is Organized

The chapters follow the order in which the ideas are easiest to learn,
which isn't always the order in which the app was first written.

**Part I, Foundations**, explains what actually happens when a browser
talks to a server, sets up the tools, and gets pages on the screen.

**Part II, Data**, introduces relational databases, how to design tables
that refuse to hold nonsense, how to change them safely over time, and
how forms get data into them.

**Part III, People**, covers accounts, sessions, and permissions, and
then steps back to show how to keep the app's most important rules in
plain, testable functions.

**Part IV, The Interface**, adds interactivity in the browser, file
uploads to object storage, and the rendering and caching model that
makes pages fast.

**Part V, Shipping**, tests the app the way users use it, packages it
into a container, builds a pipeline that delivers it safely to staging
and production, and discusses what it takes to run it for years.

Each chapter ends with a summary and a few exercises. The exercises are
there to make you open the code; doing even one per chapter will teach
you more than rereading.

## Following Along

The finished application is in this repository. You can read the book
alongside it, or build your own copy step by step and compare. To run
the finished app:

```sh
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm storage:init
pnpm db:seed
pnpm dev
```

Chapter 2 explains every one of those commands. If any fail now, don't
worry; by the end of that chapter you'll know why.

Code listings in this book are usually _excerpts_ of the real files,
sometimes trimmed to the lines that matter for the point at hand. The
file path is given above each listing so you can see the whole thing.

## Conventions Used in This Book

`Constant width` is used for code, commands, file names, and anything
you'd type.

Callouts look like this:

> [!TIP]
> A suggestion that will save you time.

> [!NOTE]
> A general note or aside.

> [!IMPORTANT]
> Something you must understand to avoid a real problem.

> [!WARNING]
> A trap people fall into, and how to avoid it.

Sidebars that compare our choice with alternatives are headed
**"Alternatives"**; sidebars that dig into how something works
underneath are headed **"Under the Hood."** You can skip either on a
first reading.

Let's begin with the most fundamental question: what happens when you
type an address into a browser?

**Next:** [Chapter 1. How the Web Actually Works](01-how-the-web-works.md)
