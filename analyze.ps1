# Process git status and diffs
$status_file = "git_status.txt"
$status = Get-Content $status_file

# Let's map each file to its logical group
function Get-Group($file) {
    if ($file -match "^(apps/desktop/src/main/|apps/desktop/src/preload/|apps/desktop/src/shared/)") {
        return "desktop main+preload+shared"
    } elseif ($file -match "^apps/desktop/src/renderer/") {
        return "desktop renderer"
    } elseif ($file -match "^(apps/desktop/tests/|apps/desktop/playwright|apps/desktop/wdio)") {
        # Check if it fits desktop tests
        return "desktop tests"
    } elseif ($file -match "^(apps/desktop/[^/]+$|apps/desktop/tests/)") {
        # Other desktop files might be tests, main or renderer, we will check
        if ($file -match "test\.[jt]s" -or $file -match "tests/") { return "desktop tests" }
        return "root"
    } elseif ($file -match "^apps/proxy-core/") {
        return "proxy-core"
    } elseif ($file -match "^packages/design-vite/shots/") {
        return "design-vite shots"
    } elseif ($file -match "^packages/design-vite/") {
        return "packages/design-vite source"
    } elseif ($file -match "^architecture/") {
        return "architecture"
    } else {
        # File is at root level or some miscellaneous directory
        if ($file -match "test\.[jt]xs?" -or $file -match "/tests/") {
            # Let's see more specifically
            if ($file -match "apps/desktop") { return "desktop tests" }
        }
        return "root"
    }
}

# Read git diff --numstat for both staged and unstaged
$cached = @{}
if (Test-Path git_numstat_cached.txt) {
    Get-Content git_numstat_cached.txt | ForEach-Object {
        if ($_ -match "^(\d+|-)\s+(\d+|-)\s+(.+)$") {
            $add = if ($Matches[1] -eq "-") { 0 } else { [int]$Matches[1] }
            $del = if ($Matches[2] -eq "-") { 0 } else { [int]$Matches[2] }
            $file = $Matches[3].Trim()
            $cached[$file] = @{add=$add; del=$del}
        }
    }
}

$unstaged = @{}
if (Test-Path git_numstat_unstaged.txt) {
    Get-Content git_numstat_unstaged.txt | ForEach-Object {
        if ($_ -match "^(\d+|-)\s+(\d+|-)\s+(.+)$") {
            $add = if ($Matches[1] -eq "-") { 0 } else { [int]$Matches[1] }
            $del = if ($Matches[2] -eq "-") { 0 } else { [int]$Matches[2] }
            $file = $Matches[3].Trim()
            $unstaged[$file] = @{add=$add; del=$del}
        }
    }
}

# Group files and count stats
$groups = @{}
# Groups list:
# root, architecture, desktop main+preload+shared, desktop renderer, desktop tests, proxy-core, packages/design-vite source, design-vite shots
$groupNames = "root", "architecture", "desktop main+preload+shared", "desktop renderer", "desktop tests", "proxy-core", "packages/design-vite source", "design-vite shots"
foreach ($g in $groupNames) { $groups[$g] = @{count=0; add=0; del=0; files=[System.Collections.Generic.List[string]]::new()} }

# Rename analysis
$renamesStaged = [System.Collections.Generic.List[PSObject]]::new()

foreach ($line in $status) {
    if ($line -match "^(..)\s+(.+)$") {
        $state = $Matches[1]
        $filePart = $Matches[2].Trim()
        
        $file = $filePart
        $orig = $null
        if ($state -match "R" -or $filePart -match "->") {
            # Rename detected
            if ($filePart -match "^(.+)\s+->\s+(.+)$") {
                $orig = $Matches[1].Trim()
                $file = $Matches[2].Trim()
                # Check quotes
                if ($orig -match "^`\"(.*)`\"$") { $orig = $Matches[1] }
                if ($file -match "^`\"(.*)`\"$") { $file = $Matches[1] }
            }
        }
        if ($file -match "^`\"(.*)`\"$") { $file = $Matches[1] }

        # Resolve logical group based on resolved file
        $g = "root"
        if ($file -match "^architecture/") { $g = "architecture" }
        elseif ($file -match "^apps/proxy-core/") { $g = "proxy-core" }
        elseif ($file -match "^packages/design-vite/(tests/fixtures|shots/|.*\.png$)") { $g = "design-vite shots" }
        elseif ($file -match "^packages/design-vite/") { $g = "packages/design-vite source" }
        elseif ($file -match "^apps/desktop/src/(main/|preload/|shared/)") { $g = "desktop main+preload+shared" }
        elseif ($file -match "^apps/desktop/src/renderer/") { $g = "desktop renderer" }
        elseif ($file -match "tests/" -or $file -match "test\.[jt]s" -or $file -match "visual-parity/" -or $file -match "\.visual\.") { $g = "desktop tests" }
        elseif ($file -match "^apps/desktop/") { $g = "desktop main+preload+shared" }
        
        $groups[$g].count++
        $groups[$g].files.Add($file)
        
        # Add to diff stats
        $add = 0; $del = 0
        if ($cached.ContainsKey($file)) {
            $add += $cached[$file].add
            $del += $cached[$file].del
        }
        if ($unstaged.ContainsKey($file)) {
            $add += $unstaged[$file].add
            $del += $unstaged[$file].del
        }
        # Also try matching rename source/destination
        if ($orig -and $cached.ContainsKey("$orig -> $file")) {
            $add += $cached["$orig -> $file"].add
            $del += $cached["$orig -> $file"].del
        }
        if ($orig -and $unstaged.ContainsKey("$orig -> $file")) {
            $add += $unstaged["$orig -> $file"].add
            $del += $unstaged["$orig -> $file"].del
        }
        
        $groups[$g].add += $add
        $groups[$g].del += $del

        if ($state[0] -eq "R") {
            # Staged rename
            $isModified = ($state[1] -eq "M" -or $cached[$file].add -gt 0 -or $cached[$file].del -gt 0 -or $unstaged[$file].add -gt 0 -or $unstaged[$file].del -gt 0)
            if (-not $isModified) {
                # Let's double check if there are any numstat entries with additions/deletions under the rename target
                # Git numstat of rename typically shows up as `add del origin -> dest`
                $matchKey = "$orig -> $file"
                if ($cached.ContainsKey($matchKey)) {
                    if ($cached[$matchKey].add -gt 0 -or $cached[$matchKey].del -gt 0) { $isModified = $true }
                }
            }
            $renamesStaged.Add([PSCustomObject]@{orig=$orig; dest=$file; modified=$isModified})
        }
    }
}

Write-Output "--- GROUPS SUMMARY ---"
foreach ($g in $groups.Keys) {
    Write-Output "Group: $g"
    Write-Output "  File Count: $($groups[$g].count)"
    Write-Output "  Lines Added: $($groups[$g].add)"
    Write-Output "  Lines Deleted: $($groups[$g].del)"
}

Write-Output "--- RENAMES STAGED ($($renamesStaged.Count) total) ---"
$rename_modified = 0
$rename_pure = 0
foreach ($r in $renamesStaged) {
    if ($r.modified) { $rename_modified++ } else { $rename_pure++ }
}
Write-Output "  Pure renames (no edits): $rename_pure"
Write-Output "  Renames with content edits: $rename_modified"

# Print renaming patterns (origins -> targets)
$patterns = @{}
foreach ($r in $renamesStaged) {
    # Extract structural patterns by replacing specific file/directory names with wildcards
    # e.g., apps/desktop/src/main/app-container/tests/app-container-service.test.ts -> apps/desktop/src/main/app-container/tests/unit/app-container-service.test.ts
    # Let's find common directory patterns
    $origDir = [System.IO.Path]::GetDirectoryName($r.orig).Replace('\', '/')
    $destDir = [System.IO.Path]::GetDirectoryName($r.dest).Replace('\', '/')
    $pat = "$origDir -> $destDir"
    if (-not $patterns.ContainsKey($pat)) { $patterns[$pat] = 0 }
    $patterns[$pat]++
}
Write-Output "  Rename patterns (source_dir -> target_dir):"
foreach ($k in $patterns.Keys) {
    Write-Output "    $k ($($patterns[$k]) files)"
}
