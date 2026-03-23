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
          x86_64-linux = "sha256-3Wpwq80n+wCZb4UkCYEWf20ekuGloLAGYfPk73mYD2Y=";
          aarch64-linux = "sha256-5/TxN0tXtmAPmjstkcKmAmPLJ33cXUgs75wf8Kd9BSM=";
          x86_64-darwin = "sha256-Cn7c+KVVjFKOfJDizupXZ+/N4MWzWswTwpEYZZ7MH+4=";
          aarch64-darwin = "sha256-gHDLsM9eMsg1QE+wARYziyHLiRmvI2Kf6DT1uHUL9KA=";
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
