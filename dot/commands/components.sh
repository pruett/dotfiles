# dot components: what dot manages, in the order init, update and doctor run it.

cmd_components() {
  local i name update
  printf '%-14s %-8s %-9s %-8s %s\n' COMPONENT PLATFORM REQUIRED UPDATE DESCRIPTION
  for i in "${!component_names[@]}"; do
    name="${component_names[$i]}"
    update=install
    declare -F "component_${name}_update" >/dev/null && update=own
    printf '%-14s %-8s %-9s %-8s %s\n' "$name" "${component_platforms[$i]}" \
      "${component_required[$i]}" "$update" "${component_descs[$i]}"
  done
  printf '\nUPDATE "install" means dot update reruns the install step. This machine: %s\n' "$dot_os"
}
