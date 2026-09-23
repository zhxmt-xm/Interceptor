#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

int main(int argumentCount, char **arguments) {
    if (argumentCount != 3) return 2;
    struct sockaddr_un address = {0};
    address.sun_family = AF_UNIX;
    if (strlen(arguments[1]) >= sizeof(address.sun_path)) return 2;
    strlcpy(address.sun_path, arguments[1], sizeof(address.sun_path));
    int connection = socket(AF_UNIX, SOCK_STREAM, 0);
    if (connection < 0) return 3;
    if (connect(connection, (struct sockaddr *)&address, sizeof(address)) < 0) {
        close(connection);
        return 4;
    }
    size_t offset = 0;
    size_t requestLength = strlen(arguments[2]);
    while (offset < requestLength) {
        ssize_t written = write(connection, arguments[2] + offset, requestLength - offset);
        if (written <= 0) { close(connection); return 5; }
        offset += (size_t)written;
    }
    if (write(connection, "\n", 1) != 1) { close(connection); return 5; }
    char buffer[4096];
    ssize_t received;
    while ((received = read(connection, buffer, sizeof(buffer))) > 0) {
        if (fwrite(buffer, 1, (size_t)received, stdout) != (size_t)received) {
            close(connection);
            return 6;
        }
    }
    close(connection);
    return received < 0 ? 7 : 0;
}