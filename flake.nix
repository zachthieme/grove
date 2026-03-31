{
  description = "grove — org planning for people who think in structures, not spreadsheets";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        groveVersion = "0.11.0";

        hashes = {
          x86_64-linux = "sha256-E5CfEB0pZXQy3glsH+IAj1+/2U9M3hddqFxM14ZPQf0=";
          aarch64-linux = "sha256-pVcvTLii1R0yQhGGAGph2Q9LPYLpUo4U4fPIIk+7ks0=";
          x86_64-darwin = "sha256-J6XlP71TCZMg9NEj9SXMC6xyzMdTzVQX32QWLAjr0w8=";
          aarch64-darwin = "sha256-I+hIQv316cJ9mTFWBNbtsHi/C6akyTn4+TuCTME4HDw=";
        };

        platformMap = {
          x86_64-linux = "linux_amd64";
          aarch64-linux = "linux_arm64";
          x86_64-darwin = "darwin_amd64";
          aarch64-darwin = "darwin_arm64";
        };

        platform = platformMap.${system} or (throw "Unsupported system: ${system}");

        grove = pkgs.stdenv.mkDerivation {
          pname = "grove";
          version = groveVersion;

          src = pkgs.fetchurl {
            url = "https://github.com/zachthieme/grove/releases/download/v${groveVersion}/grove_${platform}.tar.gz";
            hash = hashes.${system} or (throw "No hash for system: ${system}");
          };

          sourceRoot = ".";
          dontBuild = true;
          dontFixup = true;

          installPhase = ''
            mkdir -p $out/bin
            cp grove $out/bin/
          '';
        };

        grove-src = pkgs.buildGoModule {
          pname = "grove";
          version = groveVersion;
          src = ./.;

          vendorHash = null;

          nativeBuildInputs = [ pkgs.nodejs ];

          preBuild = ''
            cd web && npm ci && npm run build && cd ..
          '';

          ldflags = [ "-s" "-w" ];
        };
      in
      {
        packages = {
          default = grove;
          inherit grove grove-src;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.go
            pkgs.nodejs
            pkgs.jujutsu
          ];
        };
      });
}
