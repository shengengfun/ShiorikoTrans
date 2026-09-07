#!/bin/sh

# Linux installer for Audire
# Supports Linux x86-64 with RPM / DEB / PKG / Arch (audire-bin)
# Accepts tag in the first argument

# Usage:
# ./installer.sh {tag}

# Available at https://audire.github.io/audire/installer.sh
# Via curl -sSf https://audire.github.io/audire/installer.sh | sh -s {tag}

set -e

TAG=$1
TAG_WITHOUT_V=$(echo "$TAG" | sed 's/^v//')

echo "tag is $TAG"
if [ -z "$TAG" ]; then
    echo "Error: No tag specified. Usage: ./installer.sh {tag}"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        DEB_ARCH="amd64"
        RPM_ARCH="x86_64"
        ;;
    aarch64|arm64)
        DEB_ARCH="arm64"
        RPM_ARCH="aarch64"
        ;;
    *)
        echo "Error: Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Determine the package type and download the appropriate file
echo "Downloading Audire version $TAG for $ARCH..."

RPM_URL="https://github.com/audire/audire/releases/download/${TAG}/audire-${TAG_WITHOUT_V}-1.${RPM_ARCH}.rpm"
DEB_URL="https://github.com/audire/audire/releases/download/${TAG}/audire_${TAG_WITHOUT_V}_${DEB_ARCH}.deb"
echo $RPM_URL
# Create temporary directory for downloading
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

# Download the correct package based on the distribution
if [ -f /etc/os-release ]; then
    # Check for the package manager
    if grep -iq "ubuntu\|debian" /etc/os-release; then
        echo "Detected Debian/Ubuntu. Downloading DEB package..."
        wget "$DEB_URL" -O audire.deb
        sudo apt-get install -y ./audire.deb
    elif grep -iq "centos\|fedora\|rhel" /etc/os-release; then
        echo "Detected CentOS/Fedora/RHEL. Downloading RPM package..."
        wget -q "$RPM_URL" -O audire.rpm
        sudo rpm -ivh audire.rpm
    elif grep -iq "arch" /etc/os-release; then
        echo "Detected Arch Linux. Installing audire-bin using pacman..."
        sudo pacman -S audire-bin
    else
        echo "Unsupported Linux distribution."
        exit 1
    fi
else
    echo "Unable to determine the package manager. Please install the package manually."
    exit 1
fi

# Clean up
cd ..
rm -rf $TEMP_DIR

echo "Audire installation complete!"
echo "Run 'audire' to open it!"

