# Windows Code Signing (SignPath Foundation)

ShiorikoTrans uses the SignPath Foundation program for free Authenticode
signing of its Windows NSIS installer. SignPath holds the private key in an
HSM and verifies that every submitted binary was produced by this public
repository on a GitHub-hosted runner.

The workflow integration is ready, but signing cannot be enabled until
SignPath approves the project and provisions its organization.

## 1. Apply

1. Open <https://signpath.org/apply>.
2. Submit the public repository:
   <https://github.com/shengengfun/ShiorikoTrans>.
3. State that the project is MIT licensed and that the Windows artifact is a
   Tauri v2 NSIS installer (`ShiorikoTrans_*_x64-setup.exe`).
4. Use the existing GitHub Actions release workflow as the reproducible build
   definition: `.github/workflows/release.yml`.

Suggested application values:

| Field | Value |
| --- | --- |
| Project Name | ShiorikoTrans |
| Repository URL | `https://github.com/shengengfun/ShiorikoTrans` |
| Homepage URL | `https://github.com/shengengfun/ShiorikoTrans` |
| Download URL | `https://github.com/shengengfun/ShiorikoTrans/releases/latest` |
| Privacy Policy URL | `https://github.com/shengengfun/ShiorikoTrans/blob/main/website/public/privacy_policy.md` |
| Tagline | Local-first audio and video transcription for Windows, macOS, and Linux. |
| Build System | GitHub Actions |
| Maintainer Type | Individual / community project |

Suggested description:

> ShiorikoTrans is an MIT-licensed desktop transcription application built
> with Tauri, Rust, and React. It transcribes local audio, video, recordings,
> and supported web media on the user's device, supports multiple local ASR
> engines, and exports timestamped transcripts and subtitles.

The application also requires a project reputation statement. Use current,
verifiable GitHub release download statistics, stars, issues, community links,
or other public references. Do not invent adoption metrics.

SignPath Foundation signs under its own publisher identity. No local PFX,
hardware token, or paid certificate is required.

## 2. Configure SignPath

After approval:

1. Add the predefined **GitHub.com** Trusted Build System to the SignPath
   organization and link it to the ShiorikoTrans project.
2. Install the SignPath GitHub App for this repository when requested.
3. Create a signing policy for release builds (suggested slug: `release-signing`).
4. Create an artifact configuration (suggested slug: `windows-installer`).
5. Configure the artifact as a ZIP whose root contains one PE file matching
   `ShiorikoTrans_*_x64-setup.exe`, and enable Authenticode signing for that
   file. GitHub's `upload-artifact` action creates this ZIP automatically.
6. Create an API token for a SignPath user with permission to submit using
   that project and signing policy.

Uploading an unsigned sample installer in the SignPath artifact configuration
editor is the easiest way to generate and review the structure.

## 3. Add GitHub Actions secrets

Add these repository secrets under **Settings > Secrets and variables >
Actions**:

| Secret | Value from SignPath |
| --- | --- |
| `SIGNPATH_API_TOKEN` | Submitter API token |
| `SIGNPATH_ORGANIZATION_ID` | Organization ID (UUID) |
| `SIGNPATH_PROJECT_SLUG` | Project slug |
| `SIGNPATH_SIGNING_POLICY_SLUG` | Signing policy slug |
| `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | Artifact configuration slug |

The slugs are passed as secrets as well so the workflow requires no edit if
SignPath assigns names different from the suggestions above.

## 4. Release

Run the **Release** workflow manually and enable **Sign the Windows installer
with SignPath Foundation**. The workflow will:

1. build the unsigned NSIS installer on `windows-latest`;
2. upload it as a short-lived GitHub Actions artifact;
3. submit that artifact ID to SignPath and wait for approval/signing;
4. download the signed installer;
5. validate its Authenticode signature with `Get-AuthenticodeSignature`;
6. upload only the signed installer to the GitHub Release.

Until SignPath credentials are provisioned, leave the option disabled. The
same workflow will continue to publish an unsigned Windows installer.

## Security notes

- Never store SignPath tokens, PFX files, or private keys in the repository.
- SignPath OSS builds must remain on GitHub-hosted runners.
- Do not upload the unsigned installer to the public Release when signing is
  enabled; the workflow deliberately publishes only the returned artifact.
- The older eSigner and YubiKey documents describe alternative upstream
  setups and are not used by the ShiorikoTrans release workflow.

Official references:

- <https://signpath.org/>
- <https://docs.signpath.io/trusted-build-systems/github>
- <https://github.com/SignPath/github-action-submit-signing-request>
