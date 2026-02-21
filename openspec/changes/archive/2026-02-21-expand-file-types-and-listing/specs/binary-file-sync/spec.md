## ADDED Requirements

### Requirement: Binary file detection by extension

The server SHALL determine whether a file is binary based on its file extension. A file is binary if its extension (case-insensitive) matches any entry in the server's binary extensions set. The binary extensions set SHALL include at minimum: png, jpg, jpeg, gif, bmp, webp, ico, svg, tiff, tif, pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, zip, rar, 7z, tar, gz, bz2, xz, mp3, wav, ogg, flac, aac, wma, m4a, mp4, avi, mkv, mov, wmv, flv, webm, exe, dll, so, dylib, bin, ttf, otf, woff, woff2, eot, db, sqlite, sqlite3.

#### Scenario: PNG image detected as binary

- **WHEN** a file is created or updated with path `images/photo.png`
- **THEN** the server SHALL set `is_binary` to `true` and `extension` to `"png"`

#### Scenario: Markdown file detected as text

- **WHEN** a file is created or updated with path `notes/daily.md`
- **THEN** the server SHALL set `is_binary` to `false` and `extension` to `"md"`

#### Scenario: Case-insensitive extension matching

- **WHEN** a file is created with path `images/PHOTO.JPG`
- **THEN** the server SHALL set `is_binary` to `true` and `extension` to `"jpg"` (lowercase)

#### Scenario: File with no extension

- **WHEN** a file is created with path `notes/README`
- **THEN** the server SHALL set `is_binary` to `false` and `extension` to `null`

#### Scenario: File with dotfile name

- **WHEN** a file is created with path `.gitignore`
- **THEN** the server SHALL set `is_binary` to `false` and `extension` to `null` (leading dot is not an extension)

### Requirement: Client-side base64 encoding for binary files

The client SHALL encode binary file content as a base64 string before sending to the server (via Socket.IO events or REST API). The client SHALL decode base64 content back to binary when receiving content for files with `is_binary` set to `true`.

#### Scenario: Client uploads a binary file

- **WHEN** a local binary file is created or modified
- **THEN** the client SHALL read the file as an `ArrayBuffer`, encode it to a base64 string, and send the base64 string as the `content` field

#### Scenario: Client receives a binary file from server

- **WHEN** the client receives a `file-created` or `file-modified` event where `is_binary` is `true`
- **THEN** the client SHALL decode the `content` field from base64 to an `ArrayBuffer` and write it using `vault.createBinary()` or `vault.modifyBinary()`

#### Scenario: Client receives a text file from server

- **WHEN** the client receives a `file-created` or `file-modified` event where `is_binary` is `false` or absent
- **THEN** the client SHALL write the `content` field directly as text (existing behavior)

### Requirement: Hash computation on stored representation

The SHA-256 content hash SHALL always be computed on the content as stored — the base64 string for binary files, the plain text string for text files. Both client and server MUST use the same representation when computing hashes to ensure consistency during initial sync.

#### Scenario: Hash of binary file matches on both sides

- **WHEN** a binary file with raw bytes `[0x89, 0x50, 0x4E, ...]` is synced
- **THEN** the client SHALL compute `SHA-256(base64_encode(raw_bytes))` and the server SHALL compute `SHA-256(stored_base64_string)`, and both hashes SHALL be identical

#### Scenario: Hash of text file is unchanged

- **WHEN** a text file with content `"# Hello World"` is synced
- **THEN** the hash SHALL be `SHA-256("# Hello World")` on both client and server (existing behavior, no change)

### Requirement: Binary file conflict resolution uses server-wins

During initial sync, when a binary file has diverged (different hashes on client and server), the server version SHALL win. The client SHALL download the server's binary content and overwrite the local copy. No merge SHALL be attempted for binary files.

#### Scenario: Binary file diverged during offline period

- **WHEN** initial sync Phase 3 detects a binary file with different local and server hashes
- **THEN** the client SHALL download the server version and overwrite the local file without attempting a merge

#### Scenario: Text file diverged during offline period

- **WHEN** initial sync Phase 3 detects a text file with different local and server hashes
- **THEN** the client SHALL continue to use the existing LCS merge algorithm (no change in behavior)

### Requirement: Binary files included in all sync phases

Binary files SHALL participate in all four phases of initial sync (delete tombstones, download new, merge divergent, upload local-only) and in real-time event handling. The client SHALL NOT skip files based on extension.

#### Scenario: Binary file downloaded during initial sync Phase 2

- **WHEN** a binary file exists on the server but not locally
- **THEN** the client SHALL download and decode the base64 content, creating the binary file locally

#### Scenario: Local-only binary file uploaded during initial sync Phase 4

- **WHEN** a binary file exists locally but not on the server
- **THEN** the client SHALL encode it to base64 and upload via `modified-file` socket event

#### Scenario: Binary file deletion synced

- **WHEN** a binary file is tombstoned on the server
- **THEN** the client SHALL delete the local binary file during initial sync Phase 1

### Requirement: Content size limit applies to encoded content

The existing 10MB content limit SHALL apply to the encoded (base64) string for binary files. Since base64 encoding adds ~33% overhead, the effective limit for raw binary file size is approximately 7.5MB.

#### Scenario: Binary file within limit

- **WHEN** a client sends a binary file whose base64-encoded content is 8MB (raw file ~6MB)
- **THEN** the server SHALL accept and store the file

#### Scenario: Binary file exceeds limit

- **WHEN** a client sends a binary file whose base64-encoded content exceeds 10MB
- **THEN** the server SHALL reject the request with a `VALIDATION_ERROR`
