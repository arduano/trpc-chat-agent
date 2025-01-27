# @trpc-chat-agent/core

## 0.3.8

### Patch Changes

- 0aa30a4: Fixed ctx data in createConversation callback
- 0aa30a4: Call saveConversation on important conversation events such as beginning/ending tool calls

## 0.3.7

### Patch Changes

- ec3b9fc: Improve stream cancellation cleanup

## 0.3.6

### Patch Changes

- e712763: Improved debouncing behavior on progress/args updates
- e712763: Added extra chat message data to tool args
- e712763: Added abort signal to tool args

## 0.3.5

### Patch Changes

- 5901152: Bumped tRPC to 11.0.0-rc.718
- 5901152: Made the router use an iterable mutation instead of a subscription

## 0.3.4

### Patch Changes

- c43b30d: Fixed type definitions for AgentBackend

## 0.3.2

### Patch Changes

- 3b5721b: Added createdAt for messages

## 0.3.1

### Patch Changes

- Fixed issue with release types

## 0.3.0

### Minor Changes

- 79b7170: Added extra invocation argument support

## 0.2.2

### Patch Changes

- 1d5de0c: Improved missing conversation error handling
- 1d5de0c: Added local-first IndexDB caching of conversations

## 0.2.1

### Patch Changes

- Updated type names for AI types

## 0.2.0

### Minor Changes

- dc9f3cf: Renamed conversation related types to better reflect their purpose
