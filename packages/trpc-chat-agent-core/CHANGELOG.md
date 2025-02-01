# @trpc-chat-agent/core

## 0.4.5

### Patch Changes

- 3fa1180: Improved stream cancellation behavior

## 0.4.4

### Patch Changes

- 8e6d8a5: Exposed conversation fetching error messages

## 0.4.3

### Patch Changes

- 73f440b: Fixes around extra args not being required
- 65f99de: Added conversation path to the conversation store status values

## 0.4.1

### Patch Changes

- 39928ba: Fix type propagation for extraArgs

## 0.4.0

### Minor Changes

- 3147cd8: Altered the "extra args" API to be more generic, allowing arbitrary args to be passed in
- 3147cd8: Changed the API for backend adapters to not require instantiating classes, instead the class instances are directly provided

### Patch Changes

- 3147cd8: Backend adapters can now define extra argument schemas themselves, passing that schema type information to the agents and tools they create

## 0.3.9

### Patch Changes

- 4137114: Include created/updated time in conversation structure

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
