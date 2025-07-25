# Development Best Practices

> Version: 1.0.0
> Last updated: 2025-07-23
> Scope: Global development standards

## Context

This file is part of the Agent OS standards system. These global best practices are referenced by all product codebases and provide default development guidelines. Individual projects may extend or override these practices in their `.agent-os/product/dev-best-practices.md` file.

## Core Principles

### Keep It Simple
- Implement code in the fewest lines possible
- Avoid over-engineering solutions
- Choose straightforward approaches over clever ones

### Optimize for Readability
- Prioritize code clarity over micro-optimizations
- Write self-documenting code with clear variable names
- Add comments for "why" not "what"

### DRY (Don't Repeat Yourself)
- Extract repeated business logic to private methods
- Extract repeated UI markup to reusable components
- Create utility functions for common operations

## Dependencies

### Choose Libraries Wisely
When adding third-party dependencies:
- Select the most popular and actively maintained option
- Check the library's GitHub repository for:
  - Recent commits (within last 6 months)
  - Active issue resolution
  - Number of stars/downloads
  - Clear documentation

## Code Organization

### File Structure
- Keep files focused on a single responsibility
- Group related functionality together
- Use consistent naming conventions

### Testing
- Write tests for new functionality
- Maintain existing test coverage
- Test edge cases and error conditions

## Architecture Notes

### Project Structure
- `src/app/` - Next.js 15 App Router pages and layouts
  - `src/app/api` - API routes running on our server
    - `src/app/api/auth/` - better-auth API endpoints
- `src/components/` - Reusable UI components (shadcn/ui based)
- `src/data/` - Data Access Layer (DAL)-related files and folders for retrieving data at the server level
- `src/context/` - Context providers for managing application state
- `src/actions/` - Next.js Server Actions for handling server-side logic like form submissions, data mutations, and background tasks
- `src/lib/` - Utility functions and configurations (e.g. authentication, payments, email)
  - `src/lib/auth.ts` - better-auth configuration

### Database migrations and Schema
- Database migrations and schema managed through better-auth and Drizzle ORM

## Next.js Best Practices

### Server vs Client Component Guidelines

**Server Components (Default)**:
- Use for data fetching, database operations, and server-side logic
- Can directly import and use server-side libraries (database clients, server utilities)
- Cannot use React hooks (useState, useEffect, etc.) or browser APIs
- Should handle all data fetching and pass data as props to Client Components
- Examples: Page components, layout components, data display components

**Client Components (`"use client"`)**:
- Use only when React interactivity is required (state, effects, event handlers)
- Cannot directly perform server actions or database operations
- Should receive data via props from Server Components or API routes
- Use for forms, interactive UI elements, state management
- Examples: Form components, interactive buttons, state-dependent UI

### Data Fetching

#### Server-Side Data Fetching
- Fetch data close to the source (database, APIs)
- Reduces client-side JavaScript bundle size
- Keeps sensitive information (API keys, tokens) secure
- Improves First Contentful Paint (FCP) performance

```typescript
// ✅ PREFERRED: Server Component fetches data
export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  const posts = await data.json()

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

#### use() Hook with Context Provider Pattern (When Server-Side Not Possible)

##### Context Provider Setup:

```typescript
// app/context/blog.tsx
'use client'

import { createContext, useContext } from 'react'
import type { Blog } from '@/lib/db/schema'

type BlogContextValue = Blog[]

// Create context for promise
export const BlogContext = createContext<Promise<BlogContextValue> | null>(null)

// Provider component that accepts a promise
export function BlogProvider({
  children,
  blogPromise,
}: {
  children: React.ReactNode
  blogPromise: Promise<BlogContextValue>
}) {
  return (
    <BlogContext.Provider value={blogPromise}>
      {children}
    </BlogContext.Provider>
  )
}

// Custom hook to use the context
export function useBlog() {
  const context = useContext(BlogContext)
  if (!context) {
    throw new Error('useBlog() must be used within a BlogProvider')
  }
  return context
}
```

##### Server Component Creates Promise:

```typescript
// app/page.tsx
import { BlogProvider } from '@/lib/blog/context'
import { BlogPosts } from '@/components/blog-posts'
import { getAllBlogPosts } from '@/data/blogs'

export default function Page() {
  // Create promise but don't await it - enables streaming
  const blogPromise = getAllBlogPosts()

  return (
    <BlogProvider blogPromise={blogPromise}>
      <BlogPosts />
    </BlogProvider>
  )
}
```

##### Client Component Consumes Promise:

```typescript
// app/src/components/blog-posts.tsx
'use client'

import { use } from 'react'
import { useBlogContext } from '@/context/blogs'

export function BlogPosts() {
  const blogPromise = useBlogContext()
  const posts = use(blogPromise) // This triggers Suspense

  return (
    <div>
      <h2>{posts.length} blog posts</h2>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

##### Complete Implementation with Suspense:

- Use layout.tsx files to scope Context Providers to specific routes (e.g., `/dashboard/layout.tsx`)
- Fetch data in layouts using data layer functions and pass promises to providers
- Don't await promises in layouts - pass them directly to enable streaming
- Keep root layout minimal - avoid wrapping all routes in unnecessary providers
- Authentication and authorization should be handled in route-specific layouts

```typescript
// app/layout.tsx or app/page.tsx
import { Suspense } from 'react'
import { BlogProvider } from '@/context/blogs'
import { BlogPosts } from '@/components/blog-posts'
import { getUserBlogPosts } from '@/data/blogs'

export default async function Layout({ children }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Create promise WITHOUT awaiting - enables streaming
  const userBlogPostsPromise = getUserBlogPosts(session.user.id);

  return (
    <UserDataProvider dataPromise={userDataPromise}>
      <Suspense fallback={<DashboardSkeleton />}>
        {children}
        <BlogPosts />
      </Suspense>
    </UserDataProvider>
  );
}
```


##### Key Benefits of use() pattern with Context Provider:

- **Streaming**: Data starts loading immediately when promise is created
- **Suspense Integration**: Automatically triggers Suspense boundaries
- **Error Boundaries**: Errors in promises are caught by Error Boundaries
- **No Loading States**: Suspense handles loading UI declaratively
- **Concurrent Rendering**: Works with React's concurrent features
- **Type Safety**: Full TypeScript support with proper typing


### Data Access Layer (DAL) Architecture:

- Server-side data fetching functions should be in `src/data/` directory
- Mark data layer files with `import "server-only"` to ensure server-only execution
- Data functions should take explicit parameters (like `userId`) rather than accessing session internally
- Use React's `cache()` function to deduplicate identical requests across components
- Client Components should receive data via props from Server Components or use React Context

```typescript
// src/data/users.ts
import "server-only";
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

// Cached database query with request deduplication
export const getUser = cache(
  unstable_cache(
    async (userId: string) => {
      return await db.user.findUnique({ where: { id: userId } });
    },
    ['user'], // Cache key
    { tags: ['user'], revalidate: 3600 }
  )
);
```

### API Routes for Client-Side Data:

- When Client Components need to fetch data dynamically, use API routes (`/api/` endpoints)
- API routes handle server-side operations and return JSON responses
- Client Components can then fetch from these API routes using standard HTTP methods
- Use React Query/SWR for client-side data fetching with caching and revalidation

```typescript
// src/app/api/users/[userId]/route.ts
export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const user = await getUser(params.userId);
  return Response.json(user);
}

// Client component using API route
"use client";
import useSWR from 'swr';

export function UserProfile({ userId }: { userId: string }) {
  const { data: user, error } = useSWR(`/api/users/${userId}`, fetcher);
  if (error) return <div>Error loading user</div>;
  if (!user) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

### Loading UI & Error Boundaries

**Loading States Strategy**:
- Use `loading.tsx` files for instant loading states during navigation
- Implement granular loading with `<Suspense>` boundaries
- Create meaningful skeleton components for better UX

```typescript
// app/dashboard/loading.tsx - Route-level loading
export default function Loading() {
  return <DashboardSkeleton />;
}

// Granular loading with Suspense
export default function Page() {
  return (
    <div>
      <Header /> {/* Renders immediately */}
      <Suspense fallback={<PostsSkeleton />}>
        <Posts /> {/* Streams in when data resolves */}
      </Suspense>
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments /> {/* Streams independently */}
      </Suspense>
    </div>
  );
}
```

**Error Boundaries**:
```typescript
// error.tsx - Route-level error boundary
export default function Error({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Server Actions & Form Handling

**Server Actions Benefits**:
- Execute asynchronously on the server
- Eliminate need for API routes for mutations
- Automatic form validation and error handling
- Progressive enhancement (works without JavaScript)
- Built-in cache revalidation
- Single server roundtrip for updates

**Basic Server Action Pattern**:
```typescript
// src/actions/posts.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;

  // Validate data
  if (!title || !content) {
    throw new Error('Title and content are required');
  }

  // Create post in database
  await db.post.create({ data: { title, content } });

  // Revalidate cache and redirect
  revalidatePath('/posts');
  redirect('/posts');
}

// In your component
export default function CreatePostForm() {
  return (
    <form action={createPost}>
      <input name="title" placeholder="Title" required />
      <textarea name="content" placeholder="Content" required />
      <button type="submit">Create Post</button>
    </form>
  );
}
```

**Form Validation & Error Handling**:
- Use the `zod` library to define a schema and validate form data (can be used on both the server and client).

```typescript
'use server';

import { z } from 'zod';

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
});

export async function createPost(prevState: any, formData: FormData) {
  const result = createPostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
    };
  }

  try {
    await db.post.create({ data: result.data });
    revalidatePath('/posts');
    return { success: true };
  } catch (error) {
    return {
      errors: { general: ['Failed to create post'] }
    };
  }
}

// Client component with useFormState
"use client";
import { useActionState } from 'react';

export function CreatePostForm() {
  const [state, formAction] = useActionState(createPost, { errors: {} });

  return (
    <form action={formAction}>
      <input name="title" />
      {state.errors?.title && <p>{state.errors.title[0]}</p>}

      <textarea name="content" />
      {state.errors?.content && <p>{state.errors.content[0]}</p>}

      <button type="submit">Create Post</button>
      {state.errors?.general && <p>{state.errors.general[0]}</p>}
    </form>
  );
}
```

**Optimistic Updates with Server Actions**:
```typescript
"use client";
import { useOptimistic } from 'react';
import { addTodo } from './actions';

export function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, { ...newTodo, pending: true }]
  );

  async function formAction(formData: FormData) {
    const text = formData.get('text') as string;
    const newTodo = { id: Date.now(), text, completed: false };

    addOptimisticTodo(newTodo);
    await addTodo(formData);
  }

  return (
    <div>
      <form action={formAction}>
        <input name="text" placeholder="Add todo..." />
        <button type="submit">Add</button>
      </form>

      {optimisticTodos.map(todo => (
        <div key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
          {todo.text}
        </div>
      ))}
    </div>
  );
}
```

### Advanced Data Fetching Patterns

**Waterfall vs Parallel Data Dependencies**:
```typescript
// ❌ WATERFALL: Each request waits for the previous
export default async function Page({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  const posts = await getPostsByAuthor(user.id); // Waits for user
  const comments = await getCommentsByAuthor(user.id); // Waits for user
}

// ✅ PARALLEL: Fetch dependent data simultaneously
export default async function Page({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  const [posts, comments] = await Promise.all([
    getPostsByAuthor(user.id),
    getCommentsByAuthor(user.id)
  ]);
}
```

### Authentication Implementation
- Use better-auth session helpers in Server Components
- Client-side authentication state managed through better-auth React hooks
- Protected routes implemented at the layout level where possible
- API routes protected using better-auth middleware

```typescript
// Protected layout pattern
export default async function Layout({ children }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  return (
    <AuthProvider session={session}>
      {children}
    </AuthProvider>
  );
}
```
