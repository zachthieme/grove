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

        groveVersion = "0.8.0";

        hashes = {
          x86_64-linux = "sha256-K1aIepBjLaAH1mFT+duM8y752N7cnsmhHY0n9MpnMQY=";
          aarch64-linux = "sha256-JAcOlCU/R/r/HRCLUgPfBhHLcGMKDlaCBifXiwQys74=";
          x86_64-darwin = "sha256-xV1O5wy4XKjq9/08TOIPQlnxwcVVNywjt0y5MtLzFLU=";
          aarch64-darwin = "sha256-k3I0USaihCd6AntHSl6WhgpSgMqjNfCIZR8uOckhfu4=";
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
