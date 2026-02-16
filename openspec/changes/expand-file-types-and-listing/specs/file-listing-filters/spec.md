## ADDED Requirements

### Requirement: Filter files by extension

The `GET /api/v1/files` endpoint SHALL accept an `extension` query parameter that filters results to files matching the specified extension(s). The extension value SHALL be matched case-insensitively against the stored `extension` column. Multiple extensions MAY be specified as a comma-separated list.

#### Scenario: Filter by single extension

- **WHEN** a request is made to `GET /api/v1/files?extension=md`
- **THEN** the response SHALL include only files with extension `"md"`

#### Scenario: Filter by multiple extensions

- **WHEN** a request is made to `GET /api/v1/files?extension=png,jpg,jpeg`
- **THEN** the response SHALL include files with extension `"png"`, `"jpg"`, or `"jpeg"`

#### Scenario: Extension filter with no matches

- **WHEN** a request is made to `GET /api/v1/files?extension=xyz`
- **THEN** the response SHALL return an empty file list with `total: 0`

#### Scenario: Extension filter combined with path prefix

- **WHEN** a request is made to `GET /api/v1/files?path=notes/&extension=md`
- **THEN** the response SHALL include only `.md` files under the `notes/` prefix

### Requirement: Search file content by substring

The `GET /api/v1/files` endpoint SHALL accept a `content_contains` query parameter that filters results to files whose content contains the specified substring. The search SHALL be case-insensitive. When `content_contains` is specified, results SHALL automatically exclude binary files (`is_binary = false` is implied).

#### Scenario: Content search matches files

- **WHEN** a request is made to `GET /api/v1/files?content_contains=status: Want to try`
- **THEN** the response SHALL include only non-binary files whose content contains `"status: Want to try"` (case-insensitive match)

#### Scenario: Content search with no matches

- **WHEN** a request is made to `GET /api/v1/files?content_contains=xyznonexistent`
- **THEN** the response SHALL return an empty file list with `total: 0`

#### Scenario: Content search excludes binary files

- **WHEN** a request is made to `GET /api/v1/files?content_contains=hello`
- **THEN** the response SHALL NOT include files where `is_binary` is `true`, even if their base64 content happens to contain the substring `"hello"`

#### Scenario: Content search combined with extension filter

- **WHEN** a request is made to `GET /api/v1/files?extension=md&content_contains=recipe`
- **THEN** the response SHALL include only `.md` files whose content contains `"recipe"`

### Requirement: Filter files by partial path

The `GET /api/v1/files` endpoint SHALL accept a `path_contains` query parameter that filters results to files whose path contains the specified substring anywhere (not just as a prefix). The match SHALL be case-sensitive to preserve path semantics.

#### Scenario: Partial path match

- **WHEN** a request is made to `GET /api/v1/files?path_contains=daily`
- **THEN** the response SHALL include files like `notes/daily/2024-01-15.md`, `journal/daily-log.md`, etc.

#### Scenario: Partial path combined with prefix path

- **WHEN** a request is made to `GET /api/v1/files?path=notes/&path_contains=recipe`
- **THEN** the response SHALL include files under `notes/` whose path also contains `"recipe"` (e.g., `notes/cooking/recipe-pasta.md`)

### Requirement: Filter files by binary status

The `GET /api/v1/files` endpoint SHALL accept an `is_binary` query parameter that filters results to binary or text files.

#### Scenario: List only binary files

- **WHEN** a request is made to `GET /api/v1/files?is_binary=true`
- **THEN** the response SHALL include only files where `is_binary` is `true`

#### Scenario: List only text files

- **WHEN** a request is made to `GET /api/v1/files?is_binary=false`
- **THEN** the response SHALL include only files where `is_binary` is `false`

#### Scenario: No binary filter (default)

- **WHEN** a request is made to `GET /api/v1/files` without the `is_binary` parameter
- **THEN** the response SHALL include both binary and text files (existing behavior)

### Requirement: All filters composable with pagination

All new filter parameters (`extension`, `content_contains`, `path_contains`, `is_binary`) SHALL be composable with each other and with existing parameters (`path`, `limit`, `offset`, `include_deleted`). The `total` count in the response SHALL reflect the filtered result set.

#### Scenario: Combined filters with pagination

- **WHEN** a request is made to `GET /api/v1/files?path=notes/&extension=md&content_contains=recipe&limit=10&offset=0`
- **THEN** the response SHALL include at most 10 `.md` files under `notes/` containing `"recipe"`, and `total` SHALL reflect the total count of matching files

#### Scenario: Total count reflects filters

- **WHEN** there are 100 files in the store, 30 are `.md` files, and 5 of those contain `"recipe"`
- **THEN** a request to `GET /api/v1/files?extension=md&content_contains=recipe` SHALL return `total: 5`
