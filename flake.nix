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

        frontend = pkgs.buildNpmPackage {
          pname = "grove-frontend";
          version = "2.1.0";
          src = ./web;
          npmDepsHash = "";  # Will need to be set after first build attempt
          buildPhase = ''
            npm run build
          '';
          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';
        };

        grove = pkgs.buildGoModule {
          pname = "grove";
          version = "2.1.0";
          src = ./.;
          vendorHash = null;  # Will need to be set after first build attempt

          nativeBuildInputs = [ pkgs.nodejs ];

          preBuild = ''
            # Build frontend
            cd web
            npm ci
            npm run build
            cd ..
          '';

          ldflags = [ "-s" "-w" ];

          meta = with pkgs.lib; {
            description = "Interactive org chart planning tool";
            homepage = "https://github.com/zachthieme/grove";
            license = licenses.mit;
            mainProgram = "grove";
          };
        };
      in
      {
        packages = {
          default = grove;
          grove = grove;
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
