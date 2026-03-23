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

        groveVersion = "0.5.0";

        hashes = {
          x86_64-linux = "sha256-/n9vNFJOoyTbzgjk6ZGQPhC6AqqMJlCg9AFlgY0mlJ0=";
          aarch64-linux = "sha256-Nn/Tqo4ztGOOnHyX1mibKOiNe8SQXHQd4ZF+wlTfy6c=";
          x86_64-darwin = "sha256-JpM9g9D5N4N0ReDJY1A2+zd0kL6qfMqOY9VS3makB3c=";
          aarch64-darwin = "sha256-w0P2Wr2ZskaohhsJ+wGZUNn2MX0e8mw8ZXnOpevsl6Q=";
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
            hash = hashes.${system} or (throw "No hash for ${system}");
          };

          sourceRoot = ".";
          dontBuild = true;

          installPhase = ''
            mkdir -p $out/bin
            cp grove $out/bin/grove
            chmod +x $out/bin/grove
          '';

          meta = with pkgs.lib; {
            description = "Interactive org chart planning tool";
            homepage = "https://github.com/zachthieme/grove";
            license = licenses.mit;
            mainProgram = "grove";
            platforms = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
          };
        };

        # Source build for development
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

          meta = grove.meta;
        };
      in
      {
        packages = {
          default = grove;
          grove = grove;
          grove-src = grove-src;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
            nodejs
            jujutsu
          ];
        };
      }
    );
}
