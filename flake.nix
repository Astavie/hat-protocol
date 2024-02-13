{
  inputs.astapkgs.url = "github:Astavie/astapkgs";
  inputs.astapkgs.inputs.nixpkgs.follows = "nixpkgs";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { astapkgs, ... }: astapkgs.lib.package {

    # package = pkgs: with pkgs; ...

    devShell = pkgs: with pkgs; mkShell {

      buildInputs = [
        deno
      ];
      
    };
    
  } [ "x86_64-linux" ];
}
