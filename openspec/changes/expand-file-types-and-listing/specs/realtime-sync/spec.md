## MODIFIED Requirements

### Requirement: Server-to-Client file-created event

```typescript
interface FileCreatedEvent {
  path: string;
  content: string; // Plain text for text files, base64 for binary files
  hash: string; // "sha256:..." (71 chars)
  size: number; // Bytes
  isBinary: boolean; // Whether the file is binary
  extension: string | null; // File extension, lowercase, no dot
  createdAt: string; // ISO 8601 timestamp
}
```

The `isBinary` and `extension` fields SHALL be included in all `file-created` events. Clients MUST use the `isBinary` field to determine whether to decode `content` from base64.

#### Scenario: Binary file created event includes metadata

- **WHEN** a binary file is created at path `images/photo.png`
- **THEN** the `file-created` event SHALL include `isBinary: true`, `extension: "png"`, and `content` as a base64-encoded string

#### Scenario: Text file created event is backward-compatible

- **WHEN** a text file is created at path `notes/daily.md`
- **THEN** the `file-created` event SHALL include `isBinary: false`, `extension: "md"`, and `content` as plain text

### Requirement: Server-to-Client file-modified event

```typescript
interface FileModifiedEvent {
  path: string;
  content: string; // Plain text for text files, base64 for binary files
  hash: string;
  size: number;
  isBinary: boolean;
  extension: string | null;
  updatedAt: string; // ISO 8601 timestamp
}
```

The `isBinary` and `extension` fields SHALL be included in all `file-modified` events.

#### Scenario: Binary file modified event

- **WHEN** a binary file at path `images/photo.png` is modified
- **THEN** the `file-modified` event SHALL include `isBinary: true`, `extension: "png"`, and updated base64 `content`

### Requirement: Server-to-Client file-renamed event

```typescript
interface FileRenamedEvent {
  oldPath: string;
  newPath: string;
  content: string; // Content at new path
  hash: string;
  size: number;
  isBinary: boolean; // Based on new path's extension
  extension: string | null; // Based on new path
  updatedAt: string; // ISO 8601 timestamp
}
```

The `isBinary` and `extension` fields SHALL reflect the **new path's** extension, not the old path.

#### Scenario: Renamed file changes binary status

- **WHEN** a file is renamed from `data.txt` to `data.bin`
- **THEN** the `file-renamed` event SHALL include `isBinary: true` and `extension: "bin"` (based on new path)

### Requirement: Binary File Exclusion replaced by Binary File Inclusion

The sync system SHALL no longer exclude binary files. Both client and server SHALL process binary files through all sync paths (real-time events, initial sync, force push). The client's `BINARY_EXTENSIONS` skip list SHALL be removed and replaced with a detection function that determines encoding strategy (base64 for binary, plain text for text).

#### Scenario: Client processes binary file event

- **WHEN** the client receives a `file-modified` event with `isBinary: true`
- **THEN** the client SHALL decode the `content` from base64 and write it as binary data using `vault.modifyBinary()`

#### Scenario: Client sends binary file change

- **WHEN** a local binary file (detected by extension) is modified
- **THEN** the client SHALL read the file as binary using `vault.readBinary()`, encode to base64, and emit `modified-file` with the base64 content

#### Scenario: Force push includes binary files

- **WHEN** the user triggers "Force sync store state to local state"
- **THEN** the client SHALL upload all local files including binary files (base64-encoded) via `PUT /api/v1/files`

### Requirement: Modified-file event handles binary content

The `modified-file` client-to-server event SHALL accept base64-encoded content for binary files. The server SHALL store the content as-is (base64 string in the `content` column) and compute the SHA-256 hash on the stored string.

#### Scenario: Server stores binary content as base64

- **WHEN** a client emits `modified-file` with path `images/photo.png` and base64-encoded content
- **THEN** the server SHALL store the base64 string in the `content` column, set `is_binary` to `true`, compute `SHA-256` on the base64 string, and broadcast `file-modified` with `isBinary: true`

#### Scenario: Server stores text content as plain text

- **WHEN** a client emits `modified-file` with path `notes/daily.md` and plain text content
- **THEN** the server SHALL store the text in the `content` column, set `is_binary` to `false`, compute `SHA-256` on the plain text, and broadcast `file-modified` with `isBinary: false`
